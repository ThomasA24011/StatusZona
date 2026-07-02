const YopalCenter = [5.3489, -72.4050]; 

const defaultReports = [
  {
    id: "rep-1",
    title: "Apagón total en comercios del Centro",
    serviceType: "electricity",
    severity: "high",
    status: "active",
    location: "Calle 10 con Carrera 20, Centro de Yopal",
    lat: 5.3495,
    lng: -72.4025,
    description: "Avería de un transformador central tras sobrecarga de líneas. No hay energía eléctrica comercial en los almacenes cercanos, semáforos apagados y varios locales comerciales a oscuras. Empresa encargada ya fue notificada.",
    reporterName: "Carlos Gómez",
    votes: 42,
    reportedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString() 
  },
  {
    id: "rep-2",
    title: "Baja presión de agua generalizada e inundación",
    serviceType: "water",
    severity: "medium",
    status: "active",
    location: "Carrera 29 con Calle 24, Barrio Campiña",
    lat: 5.3435,
    lng: -72.4095,
    description: "Desde esta mañana apenas sale un hilo de agua en las canillas principales y nada en los pisos elevados. Parece haber una rotura de tubería principal sobre la Carrera 29 causando inundación en la vía.",
    reporterName: "Elena M.",
    votes: 18,
    reportedAt: new Date(Date.now() - 75 * 60 * 1000).toISOString() 
  },
  {
    id: "rep-3",
    title: "Corte de Fibra Óptica por choque vehicular",
    serviceType: "internet",
    severity: "medium",
    status: "active",
    location: "Calle 30 con Carrera 5, Barrio El Recuerdo",
    lat: 5.3552,
    lng: -72.4130,
    description: "Accidente de tránsito dañó un poste que sostiene varios tendidos aéreos de fibra óptica. La conectividad wifi y móvil está caída temporalmente en la cuadrícula residencial.",
    reporterName: "Luis Torres",
    votes: 29,
    reportedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString() // Hace 3 horas
  },
  {
    id: "rep-4",
    title: "Falta de iluminación en Parque El Resurgimiento",
    serviceType: "electricity",
    severity: "low",
    status: "resolved",
    location: "Parque El Resurgimiento, Yopal",
    lat: 5.3412,
    lng: -72.3985,
    description: "Problema resuelto. El encendido automático de las luminarias de la zona peatonal fallaba por un sensor de luz defectuoso. Enerca reemplazó el interruptor averiado.",
    reporterName: "Sofía S.",
    votes: 12,
    reportedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString() // Hace 1 día
  }
];


let reports = [];
let activeFilter = 'all'; 
let searchQuery = '';


let map = null;
let mapMarkers = {}; 
let tempSelectedCoords = null; 
let tempMarker = null; 



document.addEventListener("DOMContentLoaded", () => {

  loadReports();


  initMap();


  setupEventListeners();


  renderUI();
  updateStats();


  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});



function loadReports() {
  try {
    const saved = localStorage.getItem("statuszona_reports_yopal");
    if (saved) {
      reports = JSON.parse(saved);
    } else {
      reports = [...defaultReports];
      saveReports();
    }
  } catch (error) {
    console.error("Error al leer localStorage:", error);
    reports = [...defaultReports];
  }
}

function saveReports() {
  try {
    localStorage.setItem("statuszona_reports_yopal", JSON.stringify(reports));
  } catch (error) {
    console.error("Error al escribir localStorage:", error);
  }
}



function initMap() {

  if (!document.getElementById('map') || typeof L === 'undefined') {
    console.error("La librería de Leaflet Mapas no pudo cargarse debidamente.");
    return;
  }

  const southWest = L.latLng(5.2400, -72.4800);
  const northEast = L.latLng(5.4500, -72.3300);
  const bounds = L.latLngBounds(southWest, northEast);

  map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
    maxBounds: bounds,
    maxBoundsViscosity: 0.8,
    minZoom: 11
  }).setView(YopalCenter, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  map.on('click', (e) => {
    const coords = e.latlng;
    setTemporaryCoords(coords.lat, coords.lng);
  });
}


function syncMapMarkers() {
  if (!map) return;

  const filteredList = getFilteredReports();
  const visibleIds = filteredList.map(r => r.id);

  Object.keys(mapMarkers).forEach(id => {
    if (!visibleIds.includes(id)) {
      map.removeLayer(mapMarkers[id]);
      delete mapMarkers[id];
    }
  });

  filteredList.forEach(rep => {
    const isResolved = rep.status === 'resolved';
    
    if (mapMarkers[rep.id]) {
      return; 
    }

    const isHigh = rep.severity === 'high' && rep.status === 'active';
    let serviceIconText = '⚡';
    let colorClass = 'marker-pin-electricity';
    let pulseClass = 'pulse-electricity';

    if (isResolved) {
      serviceIconText = '✔';
      colorClass = 'marker-pin-resolved';
    } else if (rep.serviceType === 'water') {
      serviceIconText = '💧';
      colorClass = 'marker-pin-water';
      pulseClass = 'pulse-water';
    } else if (rep.serviceType === 'internet') {
      serviceIconText = '🌐';
      colorClass = 'marker-pin-internet';
      pulseClass = 'pulse-internet';
    }

    const popupHTML = `
      <div class="leaflet-popup-card">
        <div class="leaflet-popup-header">
          <span class="leaflet-popup-icon">${serviceIconText}</span>
          <span class="severity-badge severity-${isResolved ? 'resolved' : rep.severity}">
            ${isResolved ? 'Solucionado' : rep.severity === 'high' ? 'Crítico' : 'Activo'}
          </span>
          <span class="leaflet-popup-time">${getRelativeTime(rep.reportedAt)}</span>
        </div>
        <h4 class="leaflet-popup-title">${rep.title}</h4>
        <p class="leaflet-popup-location">📍 ${rep.location}</p>
        <p class="leaflet-popup-description">
          ${rep.description || 'Sin comentarios adicionales.'}
        </p>
        <div class="leaflet-popup-actions-row">
          <span class="leaflet-popup-votes">👥 ${rep.votes} Confirmaciones</span>
          <div class="leaflet-popup-buttons">
            <button 
              onclick="window.upvoteFromMap('${rep.id}')"
              class="btn-vote"
            >
              👍 Votar
            </button>
            ${!isResolved ? `
              <button 
                onclick="window.resolveFromMap('${rep.id}')"
                class="btn-resolve-done"
              >
                ✔ Resolver
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    const markerHTML = `
      <div class="custom-leaflet-marker relative">
        ${isHigh ? `<div class="marker-pulse ${pulseClass}"></div>` : ''}
        <div class="marker-pin ${colorClass}">
          <span class="text-sm font-semibold">${serviceIconText}</span>
        </div>
      </div>
    `;

    const icon = L.divIcon({
      html: markerHTML,
      className: 'custom-leaflet-marker-div',
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    const marker = L.marker([rep.lat, rep.lng], { icon: icon }).addTo(map);
    marker.bindPopup(popupHTML, { maxWidth: 260, minWidth: 200 });

    // Guardar referencia en el diccionario para buscar/eliminar rápido
    mapMarkers[rep.id] = marker;
  } );
}

window.upvoteFromMap = (id) => {
  upvoteReport(id);
};
window.resolveFromMap = (id) => {
  resolveReport(id);
};



function getFilteredReports() {
  return reports.filter(rep => {
    if (activeFilter !== 'all' && rep.serviceType !== activeFilter) {
      return false;
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchTitle = rep.title.toLowerCase().includes(q);
      const matchLoc = rep.location.toLowerCase().includes(q);
      const matchDesc = rep.description.toLowerCase().includes(q);
      const matchReporter = rep.reporterName.toLowerCase().includes(q);
      if (!matchTitle && !matchLoc && !matchDesc && !matchReporter) {
        return false;
      }
    }

    return true;
  });
}

function renderUI() {
  const container = document.getElementById("reports-list-container");
  if (!container) return;

  const filtered = getFilteredReports();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="loader-container">
        <p class="font-bold">Sin reportes registrados</p>
        <p style="font-size: 0.72rem; margin-top: 4px;">No se encontraron reportes con los criterios activos. Intenta con otra búsqueda.</p>
      </div>
    `;
    syncMapMarkers();
    return;
  }

  container.innerHTML = '';
  filtered.forEach(rep => {
    const isResolved = rep.status === 'resolved';
    
    let serviceEmoji = '⚡';
    let serviceColorClass = 'electricity-icon';
    if (rep.serviceType === 'water') {
      serviceEmoji = '💧';
      serviceColorClass = 'water-icon';
    } else if (rep.serviceType === 'internet') {
      serviceEmoji = '🌐';
      serviceColorClass = 'internet-icon';
    }

    const card = document.createElement("div");
    card.id = `card-${rep.id}`;
    card.className = "report-card animate-fade-in";

    card.addEventListener("click", (e) => {
      if (e.target.closest('button')) return;
      focusOnReport(rep);
    });

    card.innerHTML = `
      <!-- Icono Categoría de Servicio -->
      <div class="category-icon ${serviceColorClass}">
        <span class="text-base">${serviceEmoji}</span>
      </div>

      <!-- Cuerpo del Mensaje -->
      <div class="card-body">
        <div class="card-header-row">
          <h3 class="card-title">${rep.title}</h3>
          
          <!-- Badge de Gravedad / Resuelto -->
          <span class="severity-badge severity-${isResolved ? 'resolved' : rep.severity}">
            ${isResolved ? 'Resuelto' : rep.severity === 'high' ? 'Crítico' : 'Activo'}
          </span>
        </div>

        <p class="card-location">📍 ${rep.location}</p>
        <p class="card-description">${rep.description || 'Sin comentarios adicionales.'}</p>
        
        <!-- Fila de Interacciones -->
        <div class="card-footer-row">
          <span class="card-reporter">👤 Por ${rep.reporterName}</span>
          <span class="bullet">•</span>
          <span class="card-time">${getRelativeTime(rep.reportedAt)}</span>

          <!-- Botones de Acción -->
          <div class="card-actions">
            <button 
              id="upvote-btn-${rep.id}"
              class="btn-vote"
            >
              👍 <span>${rep.votes}</span>
            </button>
            ${!isResolved ? `
              <button 
                id="resolve-btn-${rep.id}"
                class="btn-resolve-done"
              >
                ✔ Listo
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    const upvoteButton = card.querySelector(`#upvote-btn-${rep.id}`);
    if (upvoteButton) {
      upvoteButton.addEventListener("click", () => upvoteReport(rep.id));
    }

    const resolveButton = card.querySelector(`#resolve-btn-${rep.id}`);
    if (resolveButton) {
      resolveButton.addEventListener("click", () => resolveReport(rep.id));
    }

    container.appendChild(card);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();

  syncMapMarkers();
}

function focusOnReport(rep) {
  if (!map) return;
  
  map.flyTo([rep.lat, rep.lng], 16, {
    animate: true,
    duration: 1.2
  });

  setTimeout(() => {
    if (mapMarkers[rep.id]) {
      mapMarkers[rep.id].openPopup();
    }
  }, 900);

  const cardElement = document.getElementById(`card-${rep.id}`);
  if (cardElement) {
    cardElement.style.backgroundColor = 'var(--primary-light)';
    setTimeout(() => {
      cardElement.style.backgroundColor = '';
    }, 2000);
  }
}



function upvoteReport(id) {
  const index = reports.findIndex(r => r.id === id);
  if (index !== -1) {
    reports[index].votes += 1;
    saveReports();
    renderUI();
    updateStats();
    showToast("¡Voto registrado! Confirmado como evento activo.");

    if (mapMarkers[id] && mapMarkers[id].isPopupOpen()) {
      mapMarkers[id].closePopup();
      map.removeLayer(mapMarkers[id]);
      delete mapMarkers[id];
      syncMapMarkers();
      setTimeout(() => {
        if (mapMarkers[id]) mapMarkers[id].openPopup();
      }, 50);
    }
  }
}

function resolveReport(id) {
  const index = reports.findIndex(r => r.id === id);
  if (index !== -1) {
    reports[index].status = 'resolved';
    saveReports();
    renderUI();
    updateStats();
    showToast("Servicio marcado como SOLUCIONADO con éxito.");

    if (mapMarkers[id]) {
      map.removeLayer(mapMarkers[id]);
      delete mapMarkers[id];
      syncMapMarkers();
    }
  }
}

function updateStats() {
  const activeCount = reports.filter(r => r.status === 'active').length;
  const resolvedCount = reports.filter(r => r.status === 'resolved').length;

  const countNavActive = document.getElementById("active-count-nav");
  const countNavRes = document.getElementById("resolved-count-nav");

  if (countNavActive) countNavActive.textContent = activeCount;
  if (countNavRes) countNavRes.textContent = resolvedCount;
}


function setTemporaryCoords(lat, lng) {
  tempSelectedCoords = { lat, lng };

  if (tempMarker) {
    map.removeLayer(tempMarker);
  }

  const tempHTML = `
    <div class="custom-leaflet-marker">
      <div class="marker-pin" style="background-color: var(--primary); border-color: white;">
        <span class="text-sm">📍</span>
      </div>
    </div>
  `;
  const tempIcon = L.divIcon({
    html: tempHTML,
    className: 'custom-leaflet-marker-div-temp',
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });

  tempMarker = L.marker([lat, lng], { icon: tempIcon }).addTo(map);

  const indicator = document.getElementById("coords-selection-indicator");
  if (indicator) {
    indicator.classList.remove("hidden");
  }

  map.panTo([lat, lng]);
}

function clearTemporaryCoords() {
  tempSelectedCoords = null;
  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }
  
  const indicator = document.getElementById("coords-selection-indicator");
  if (indicator) {
    indicator.classList.add("hidden");
  }
}

function openModal() {
  const modal = document.getElementById("modal-report");
  if (!modal) return;

  const badge = document.getElementById("modal-coord-badge");
  const coordText = document.getElementById("coords-display");
  const latInput = document.getElementById("form-lat");
  const lngInput = document.getElementById("form-lng");

  if (tempSelectedCoords) {
    latInput.value = tempSelectedCoords.lat.toFixed(6);
    lngInput.value = tempSelectedCoords.lng.toFixed(6);
    
    if (badge) badge.classList.remove("hidden");
    if (coordText) {
      coordText.textContent = `Capturado: ${tempSelectedCoords.lat.toFixed(4)}, ${tempSelectedCoords.lng.toFixed(4)}`;
      coordText.style.color = "var(--success)";
      coordText.style.fontWeight = "bold";
    }
  } else {
    latInput.value = YopalCenter[0];
    lngInput.value = YopalCenter[1];

    if (badge) badge.classList.add("hidden");
    if (coordText) {
      coordText.textContent = "Por defecto: Real";
      coordText.style.color = "var(--text-slate-400)";
      coordText.style.fontWeight = "normal";
    }
  }

  modal.classList.remove("hidden");
}

function closeModal() {
  const modal = document.getElementById("modal-report");
  if (modal) {
    modal.classList.add("hidden");
  }

  document.getElementById("report-form").reset();
  
  document.querySelectorAll(".service-select-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  const defaultBtn = document.querySelector('[data-service="electricity"]');
  if (defaultBtn) {
    defaultBtn.classList.add("active");
  }
  document.getElementById("form-service-type").value = "electricity";
}

function handleSaveReport() {
  const form = document.getElementById("report-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const serviceType = document.getElementById("form-service-type").value;
  const title = document.getElementById("form-title").value.trim();
  const location = document.getElementById("form-location").value.trim();
  const severity = document.getElementById("form-severity").value;
  const reporterName = document.getElementById("form-reporter").value.trim();
  const description = document.getElementById("form-desc").value.trim();
  const lat = parseFloat(document.getElementById("form-lat").value) || YopalCenter[0];
  const lng = parseFloat(document.getElementById("form-lng").value) || YopalCenter[1];

  const newReport = {
    id: "rep-" + Date.now(),
    title,
    serviceType,
    severity,
    status: "active",
    location,
    lat,
    lng,
    description,
    reporterName,
    votes: 1, 
    reportedAt: new Date().toISOString()
  };

  reports.unshift(newReport);
  saveReports();

  clearTemporaryCoords();
  closeModal();

  renderUI();
  updateStats();
  
  setTimeout(() => {
    focusOnReport(newReport);
  }, 400);

  showToast("¡Reporte de corte publicado exitosamente!");
}


function setupEventListeners() {
  
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderUI();
    });
  }

  const filterButtons = {
    'all': document.getElementById("filter-all"),
    'electricity': document.getElementById("filter-electricity"),
    'water': document.getElementById("filter-water"),
    'internet': document.getElementById("filter-internet"),
  };

  Object.keys(filterButtons).forEach(type => {
    const btn = filterButtons[type];
    if (btn) {
      btn.addEventListener("click", () => {
        // Desactivar todos los activos anteriores
        Object.keys(filterButtons).forEach(t => {
          const b = filterButtons[t];
          if (b) {
            b.classList.remove("active");
          }
        });

        btn.classList.add("active");

        activeFilter = type;
        renderUI();
      });
    }
  });

  document.querySelectorAll(".service-select-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".service-select-btn").forEach(b => {
        b.classList.remove("active");
      });

      btn.classList.add("active");

      document.getElementById("form-service-type").value = btn.dataset.service;
    });
  });

  const btnOpenForm = document.getElementById("btn-open-form");
  if (btnOpenForm) btnOpenForm.addEventListener("click", openModal);

  const btnCloseModal = document.getElementById("btn-close-modal");
  if (btnCloseModal) btnCloseModal.addEventListener("click", closeModal);

  const btnCancelModal = document.getElementById("btn-cancel-modal");
  if (btnCancelModal) btnCancelModal.addEventListener("click", closeModal);

  const btnSaveReport = document.getElementById("btn-save-report");
  if (btnSaveReport) btnSaveReport.addEventListener("click", handleSaveReport);

  const btnCancelCoord = document.getElementById("btn-cancel-coord");
  if (btnCancelCoord) btnCancelCoord.addEventListener("click", clearTemporaryCoords);

  const btnConfirmCoordReport = document.getElementById("btn-confirm-coord-report");
  if (btnConfirmCoordReport) btnConfirmCoordReport.addEventListener("click", openModal);
}


function showToast(message) {
  const toast = document.getElementById("toast");
  const msgText = document.getElementById("toast-message");
  
  if (!toast || !msgText) return;

  msgText.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function getRelativeTime(isoString) {
  const past = new Date(isoString);
  const diffMs = Date.now() - past.getTime();
  const diffMins = Math.round(diffMs / (60 * 1000));
  const diffHours = Math.round(diffMs / (3600 * 1000));
  
  if (diffMins < 1) return 'Hace un instante';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours} h`;
  
  return past.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
}
