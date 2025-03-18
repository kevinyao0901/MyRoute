// 替换为你的 OpenRouteService API Key
const apiKey = "5b3ce3597851110001cf6248ad98c1b4e675463aac39243dafb40cb2";

document.addEventListener("DOMContentLoaded", () => {
  // 初始化 Leaflet 地图
  const map = L.map('map').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const placeInput = document.getElementById('placeInput');
  const addPlaceBtn = document.getElementById('addPlace');
  const calcRouteBtn = document.getElementById('calcRoute');
  const routeModeSelect = document.getElementById('routeMode');
  const placeListEl = document.getElementById('placeList');
  const directionsDiv = document.getElementById('directions');

  // 存放地点对象，格式：{ name, coord: [lon, lat] }
  const places = [];
  // 存放对应的地图标记
  const markers = [];

  // 渲染地点列表，每项显示地点名称和删除按钮
  function renderPlaceList() {
    placeListEl.innerHTML = "";
    places.forEach((place, index) => {
      const li = document.createElement('li');
      li.textContent = place.name;
      // 创建删除按钮
      const delBtn = document.createElement('button');
      delBtn.textContent = "删除";
      delBtn.addEventListener("click", () => {
        // 删除对应的地点和标记
        places.splice(index, 1);
        if (markers[index]) {
          map.removeLayer(markers[index]);
          markers.splice(index, 1);
        }
        renderPlaceList();
      });
      li.appendChild(delBtn);
      placeListEl.appendChild(li);
    });
  }

  // 添加地点按钮事件
  addPlaceBtn.addEventListener('click', () => {
    const name = placeInput.value.trim();
    if (!name) {
      alert("请输入地点名称！");
      return;
    }
    // 调用地理编码 API 获取坐标
    getCoordinatesForPlace(name)
      .then(coord => {
        if (coord) {
          places.push({ name, coord });
          // 添加地图标记（Leaflet 需要 [lat, lon]）
          const marker = L.marker([coord[1], coord[0]]).addTo(map)
            .bindPopup(name)
            .openPopup();
          markers.push(marker);
          // 缩放地图到所有标记范围
          const latlngs = markers.map(m => m.getLatLng());
          if (latlngs.length > 0) {
            map.fitBounds(L.latLngBounds(latlngs));
          }
          placeInput.value = "";
          renderPlaceList();
        } else {
          alert("未找到地点：" + name);
        }
      })
      .catch(err => {
        console.error("地理编码错误：", err);
        alert("获取地点信息失败！");
      });
  });

  // 规划路线按钮事件
  calcRouteBtn.addEventListener('click', () => {
    if (places.length < 2) {
      alert("请至少添加两个地点！");
      return;
    }
    // 计算 TSP 顺序（简单贪心算法，基于直线距离计算）
    const order = solveTSP(places.map(p => p.coord));
    // 根据顺序构造新的坐标数组
    const orderedCoords = order.map(index => places[index].coord);
    // 获取当前选择的模式（driving-car 或 foot-walking）
    const mode = routeModeSelect.value;
    // 调用 ORS Directions API 获取路线数据
    getRoute(orderedCoords, mode)
      .then(routeData => {
        // 清除之前的路线图层
        if (window.routeLayer) {
          map.removeLayer(window.routeLayer);
        }
        window.routeLayer = L.geoJSON(routeData, {
          style: {
            color: "blue",
            weight: 4
          }
        }).addTo(map);
        // 生成每段路程的详细信息
        renderRouteLegs(order, mode);
      })
      .catch(err => {
        console.error("获取路线错误：", err);
        alert("获取路线失败！");
      });
  });

  // 调用 ORS Directions API 获取路线数据（GeoJSON 格式）
  function getRoute(coords, mode) {
    const url = `https://api.openrouteservice.org/v2/directions/${mode}/geojson`;
    return fetch(url, {
      method: "POST",
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ coordinates: coords })
    })
    .then(response => response.json());
  }

  // 使用 OpenRouteService 的地理编码 API 获取地点坐标
  function getCoordinatesForPlace(placeName) {
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(placeName)}&size=1`;
    return fetch(url)
      .then(response => response.json())
      .then(data => {
        if (data.features && data.features.length > 0) {
          // 坐标格式为 [lon, lat]
          return data.features[0].geometry.coordinates;
        }
        return null;
      });
  }

  // 简单的贪心 TSP 算法，返回访问顺序的索引数组
  function solveTSP(coordinates) {
    const n = coordinates.length;
    const visited = Array(n).fill(false);
    const route = [0];
    visited[0] = true;
    for (let i = 0; i < n - 1; i++) {
      const last = route[route.length - 1];
      let next = -1;
      let minDist = Infinity;
      for (let j = 0; j < n; j++) {
        if (!visited[j]) {
          const d = haversineDistance(coordinates[last], coordinates[j]);
          if (d < minDist) {
            minDist = d;
            next = j;
          }
        }
      }
      if (next !== -1) {
        route.push(next);
        visited[next] = true;
      }
    }
    return route;
  }

  // Haversine 公式计算两点间直线距离（单位：公里）
  function haversineDistance(coord1, coord2) {
    const toRad = angle => angle * Math.PI / 180;
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    const R = 6371; // 地球半径，单位：公里
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // 根据 TSP 顺序和模式，生成每段路程的预估信息并显示
  function renderRouteLegs(order, mode) {
    let html = "";
    // 对于步行和驾车分别定义平均速度：步行 5 km/h (1km约12分钟)，驾车 60 km/h (1km约1分钟)
    order.forEach((index, i) => {
      if (i < order.length - 1) {
        const startPlace = places[order[i]];
        const endPlace = places[order[i+1]];
        const distance = haversineDistance(startPlace.coord, endPlace.coord); // 单位：公里
        const walkTime = distance * 12; // 分钟
        const driveTime = distance;     // 分钟
        html += `<div class="route-leg">
                    <strong>从 ${startPlace.name} 到 ${endPlace.name}</strong><br>
                    距离：${distance.toFixed(2)} 公里<br>
                    预估步行时间：${walkTime.toFixed(0)} 分钟<br>
                    预估驾车时间：${driveTime.toFixed(0)} 分钟
                 </div>`;
      }
    });
    directionsDiv.innerHTML = html;
  }
});
