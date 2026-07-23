const YopalCenter = [5.3489, -72.4050]; 

// URL base de la API — ajusta si cambia la ruta en XAMPP
const API_BASE = 'http://localhost/statuszona/api';

// Votos de esta sesión — se reinicia al cerrar la pestaña (sessionStorage)
const VOTES_KEY = 'statuszona_voted_ids';
function getVotedIds()       { return JSON.parse(sessionStorage.getItem(VOTES_KEY) || '[]'); }
function hasVoted(id)        { return getVotedIds().includes(id); }
function markVoted(id)       { const v = getVotedIds(); v.push(id); sessionStorage.setItem(VOTES_KEY, JSON.stringify(v)); }


let reports = [];
let activeFilter = 'all'; 
let searchQuery = '';


let map = null;
let mapMarkers = {}; 
let tempSelectedCoords = null; 
let tempMarker = null;
let pickingLocation = false; // true: esperando que el usuario toque el mapa



document.addEventListener("DOMContentLoaded", async () => {

  initMap();
  setupEventListeners();

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  await loadReports();
});



async function loadReports() {
  try {
    const params = new URLSearchParams();
    params.set('status', 'active'); // solo mostrar reportes activos
    if (activeFilter !== 'all') params.set('service_type', activeFilter);
    if (searchQuery.trim() !== '') params.set('search', searchQuery.trim());

    const res  = await fetch(`${API_BASE}/reports.php?${params}`);
    const json = await res.json();

    if (!json.success) throw new Error(json.error);

    reports = json.data.reports;
    updateStats(json.data.activeCount, json.data.resolvedCount);
    renderUI();
  } catch (err) {
    console.error("Error al cargar reportes desde la API:", err);
    showToast("No se pudo conectar con la API. Verifica que XAMPP esté activo.");
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

    if (pickingLocation) {
      pickingLocation = false;
      const indicator = document.getElementById("coords-selection-indicator");
      if (indicator) indicator.classList.add("hidden");
    }

    // Ambos flujos terminan igual: marcador + modal
    setTemporaryCoords(coords.lat, coords.lng);
    openModal();
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
        
        <p class="leaflet-popup-description">
          ${rep.description || 'Sin comentarios adicionales.'}
        </p>
        <div class="leaflet-popup-actions-row">
          <span class="leaflet-popup-votes">👥 ${rep.votes} Confirmaciones</span>
          <div class="leaflet-popup-buttons">
            <button 
              onclick="window.upvoteFromMap('${rep.id}')"
              class="btn-vote${hasVoted(rep.id) ? ' btn-vote--voted' : ''}"
              ${hasVoted(rep.id) ? 'disabled title="Ya votaste en esta sesión"' : ''}
            >
              ${hasVoted(rep.id) ? '✅ Votado' : '👍 Votar'}
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
              class="btn-vote${hasVoted(rep.id) ? ' btn-vote--voted' : ''}"
              ${hasVoted(rep.id) ? 'disabled title="Ya votaste en esta sesión"' : ''}
            >
              ${hasVoted(rep.id) ? '✅' : '👍'} <span>${rep.votes}</span>
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



async function upvoteReport(id) {
  if (hasVoted(id)) {
    showToast("Ya confirmaste este reporte en esta sesión.");
    return;
  }

  // Feedback inmediato optimista: incrementa el contador localmente
  const index = reports.findIndex(r => r.id === id);
  if (index !== -1) reports[index].votes += 1;
  renderUI();

  try {
    const res  = await fetch(`${API_BASE}/vote.php`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reportId: id }),
    });
    const json = await res.json();

    if (!json.success) throw new Error(json.error);

    // Sincronizar con el valor real que devuelve la BD
    const idx = reports.findIndex(r => r.id === id);
    if (idx !== -1) reports[idx] = json.data;

    markVoted(id);
    showToast("¡Voto registrado! Confirmado como evento activo.");

    // Refrescar marcador del mapa si su popup estaba abierto
    if (mapMarkers[id] && mapMarkers[id].isPopupOpen()) {
      mapMarkers[id].closePopup();
      map.removeLayer(mapMarkers[id]);
      delete mapMarkers[id];
      syncMapMarkers();
      setTimeout(() => { if (mapMarkers[id]) mapMarkers[id].openPopup(); }, 50);
    } else {
      renderUI();
    }
  } catch (err) {
    console.error("Error al registrar voto:", err);
    // Revertir el optimismo si la API falló
    await loadReports();
    showToast("Error al registrar el voto. Intenta de nuevo.");
  }
}

async function resolveReport(id) {
  try {
    const res  = await fetch(`${API_BASE}/vote.php`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reportId: id, action: 'resolve' }),
    });
    const json = await res.json();

    if (!json.success) throw new Error(json.error);

    // Actualizar en el array local con la respuesta de la BD
    const idx = reports.findIndex(r => r.id === id);
    if (idx !== -1) reports[idx] = json.data;

    // Retirar marcador activo y re-pintar como resuelto
    if (mapMarkers[id]) {
      map.removeLayer(mapMarkers[id]);
      delete mapMarkers[id];
    }

    renderUI();
    updateStats(
      reports.filter(r => r.status === 'active').length,
      reports.filter(r => r.status === 'resolved').length
    );
    showToast("Servicio marcado como SOLUCIONADO con éxito.");
  } catch (err) {
    console.error("Error al resolver reporte:", err);
    showToast("No se pudo marcar como resuelto. Intenta de nuevo.");
  }
}

// Recibe los totales directamente de la respuesta de la API
// para reflejar el conteo real de la BD, no solo la vista filtrada.
function updateStats(activeCount = 0, resolvedCount = 0) {
  const countNavActive = document.getElementById("active-count-nav");
  const countNavRes    = document.getElementById("resolved-count-nav");
  const fabBadge       = document.getElementById("fab-active-count");

  if (countNavActive) countNavActive.textContent = activeCount;
  if (countNavRes)    countNavRes.textContent    = resolvedCount;
  if (fabBadge)       fabBadge.textContent       = activeCount;
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

  // Solo mostrar el indicador en clics libres (sin modo picking).
  // En modo picking el indicador ya estaba visible y se oculta al abrir el modal.
  if (!pickingLocation) {
    const indicator = document.getElementById("coords-selection-indicator");
    if (indicator) indicator.classList.remove("hidden");
  }

  map.panTo([lat, lng]);
}

function clearTemporaryCoords() {
  pickingLocation = false;
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
  const modal    = document.getElementById("modal-report");
  if (!modal) return;

  const latInput = document.getElementById("form-lat");
  const lngInput = document.getElementById("form-lng");
  const locInput = document.getElementById("form-location");

  const lat = tempSelectedCoords ? tempSelectedCoords.lat : YopalCenter[0];
  const lng = tempSelectedCoords ? tempSelectedCoords.lng : YopalCenter[1];

  latInput.value = lat.toFixed(6);
  lngInput.value = lng.toFixed(6);
  if (locInput) locInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

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

  clearTemporaryCoords();
}

async function handleSaveReport() {
  const form = document.getElementById("report-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const lat = parseFloat(document.getElementById("form-lat").value) || YopalCenter[0];
  const lng = parseFloat(document.getElementById("form-lng").value) || YopalCenter[1];

  // location siempre tendrá valor: el que guardó openModal() o las coords como fallback
  const locationEl = document.getElementById("form-location");
  const location   = (locationEl?.value?.trim()) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  const payload = {
    title:        document.getElementById("form-title").value.trim(),
    serviceType:  document.getElementById("form-service-type").value,
    severity:     document.getElementById("form-severity").value,
    location,
    lat,
    lng,
    reporterName: document.getElementById("form-reporter").value.trim(),
    description:  document.getElementById("form-desc").value.trim(),
  };

  // Deshabilitar el botón mientras se guarda para evitar doble envío
  const btnSave = document.getElementById("btn-save-report");
  if (btnSave) btnSave.disabled = true;

  try {
    const res  = await fetch(`${API_BASE}/reports.php`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();

    if (!json.success) throw new Error(json.error);

    const newReport = json.data;
    reports.unshift(newReport);

    clearTemporaryCoords();
    closeModal();
    renderUI();

    // Pedir contadores actualizados a la BD
    await refreshStats();

    setTimeout(() => { focusOnReport(newReport); }, 400);
    showToast("¡Reporte de corte publicado exitosamente!");
  } catch (err) {
    console.error("Error al guardar reporte:", err);
    showToast("No se pudo guardar el reporte. Verifica tu conexión.");
  } finally {
    if (btnSave) btnSave.disabled = false;
  }
}

// Pide solo los contadores globales sin recargar toda la lista
async function refreshStats() {
  try {
    const res  = await fetch(`${API_BASE}/reports.php?limit=1`);
    const json = await res.json();
    if (json.success) {
      updateStats(json.data.activeCount, json.data.resolvedCount);
    }
  } catch (_) { /* silencioso: los contadores no son críticos */ }
}


function setupEventListeners() {
  
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    let searchDebounce = null;
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      // Debounce de 300ms para no llamar a la API en cada tecla
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => loadReports(), 300);
    });
  }

  const filterButtons = {
    'all':         document.getElementById("filter-all"),
    'electricity': document.getElementById("filter-electricity"),
    'water':       document.getElementById("filter-water"),
    'internet':    document.getElementById("filter-internet"),
  };

  Object.keys(filterButtons).forEach(type => {
    const btn = filterButtons[type];
    if (btn) {
      btn.addEventListener("click", () => {
        Object.keys(filterButtons).forEach(t => {
          const b = filterButtons[t];
          if (b) b.classList.remove("active");
        });

        btn.classList.add("active");
        activeFilter = type;

        // Los filtros los aplica la API, no el array local
        loadReports();
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
  if (btnOpenForm) {
    btnOpenForm.addEventListener("click", () => {
      pickingLocation = true;
      // Mostrar el indicador de selección en el mapa (reutiliza el elemento existente)
      const indicator = document.getElementById("coords-selection-indicator");
      if (indicator) indicator.classList.remove("hidden");
    });
  }

  const btnCloseModal = document.getElementById("btn-close-modal");
  if (btnCloseModal) btnCloseModal.addEventListener("click", closeModal);

  const btnCancelModal = document.getElementById("btn-cancel-modal");
  if (btnCancelModal) btnCancelModal.addEventListener("click", closeModal);

  const btnSaveReport = document.getElementById("btn-save-report");
  if (btnSaveReport) btnSaveReport.addEventListener("click", handleSaveReport);

  // "Cambiar ubicación": cierra el modal y activa el modo de selección
  const btnChangeLocation = document.getElementById("btn-change-location");
  if (btnChangeLocation) {
    btnChangeLocation.addEventListener("click", () => {
      closeModal();
      pickingLocation = true;
      const indicator = document.getElementById("coords-selection-indicator");
      if (indicator) indicator.classList.remove("hidden");
    });
  }

  const btnCancelCoord = document.getElementById("btn-cancel-coord");
  if (btnCancelCoord) btnCancelCoord.addEventListener("click", clearTemporaryCoords);

  const btnConfirmCoordReport = document.getElementById("btn-confirm-coord-report");
  if (btnConfirmCoordReport) btnConfirmCoordReport.addEventListener("click", openModal);

  // ── Panel móvil (bottom sheet) ──────────────────────────────
  const sidebar        = document.getElementById("sidebar");
  const overlay        = document.getElementById("mobile-panel-overlay");
  const fabBtn         = document.getElementById("btn-mobile-reports");

  function openMobilePanel() {
    sidebar?.classList.add("mobile-open");
    overlay?.classList.add("active");
    document.body.style.overflow = "hidden";
  }
  function closeMobilePanel() {
    sidebar?.classList.remove("mobile-open");
    overlay?.classList.remove("active");
    document.body.style.overflow = "";
  }

  if (fabBtn)  fabBtn.addEventListener("click", openMobilePanel);
  if (overlay) overlay.addEventListener("click", closeMobilePanel);

  // Cerrar panel al abrir el modal (para que el modal se vea limpio)
  const origOpenModal = window.openModal;
  window._closeMobilePanel = closeMobilePanel;
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