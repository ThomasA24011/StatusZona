# StatusZona — API REST PHP

API REST para el proyecto StatusZona. Reemplaza el `localStorage` del frontend por una base de datos MySQL persistente en XAMPP.

---

## Instalación en XAMPP

### 1. Copiar la carpeta
Copia la carpeta `api/` dentro de tu proyecto en XAMPP:
```
C:\xampp\htdocs\statuszona\api\
```

### 2. Crear la base de datos
Abre **phpMyAdmin** → `http://localhost/phpmyadmin` y ejecuta el archivo `statuszona.sql` que ya tienes.

### 3. Verificar credenciales
Abre `config/database.php` y confirma que coinciden con tu XAMPP:
```php
define('DB_HOST',     'localhost');
define('DB_USER',     'root');
define('DB_PASSWORD', '');        // vacío por defecto en XAMPP
define('DB_NAME',     'statuszona');
```

### 4. Verificar que funciona
Abre en el navegador:
```
http://localhost/statuszona/api/health.php
```
Debes ver un JSON con `"status": "ok"`.

---

## Endpoints

### `GET /api/health.php`
Verifica que la API y la BD están operativas.

---

### `GET /api/reports.php`
Lista todos los reportes. Acepta filtros opcionales por query string.

| Parámetro      | Tipo   | Ejemplo                  | Descripción                        |
|----------------|--------|--------------------------|------------------------------------|
| `service_type` | string | `?service_type=water`    | Filtra por tipo de servicio        |
| `status`       | string | `?status=active`         | Filtra por estado                  |
| `search`       | string | `?search=apagón`         | Búsqueda libre en título/dirección |
| `limit`        | int    | `?limit=50`              | Máx resultados (default 100)       |
| `offset`       | int    | `?offset=50`             | Paginación                         |

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "reports": [ ...array de reportes... ],
    "total": 4,
    "activeCount": 3,
    "resolvedCount": 1
  }
}
```

---

### `POST /api/reports.php`
Crea un nuevo reporte.

**Body JSON:**
```json
{
  "title":        "Apagón total en el centro",
  "serviceType":  "electricity",
  "severity":     "high",
  "location":     "Calle 10 con Carrera 20, Centro de Yopal",
  "lat":          5.3495,
  "lng":          -72.4025,
  "reporterName": "Carlos Gómez",
  "description":  "Texto opcional..."
}
```

**Campos requeridos:** `title`, `serviceType`, `severity`, `location`, `lat`, `lng`, `reporterName`

**Valores válidos:**
- `serviceType`: `electricity` | `water` | `internet`
- `severity`: `low` | `medium` | `high`

**Respuesta:** `201 Created` con el reporte creado.

---

### `GET /api/report.php?id=rep-xxx`
Obtiene un reporte por su ID.

---

### `PUT /api/report.php?id=rep-xxx`
Actualiza campos de un reporte existente. Solo se actualizan los campos que se envíen.

**Body JSON (todos opcionales):**
```json
{
  "title":        "Nuevo título",
  "serviceType":  "water",
  "severity":     "low",
  "status":       "resolved",
  "location":     "Nueva dirección",
  "description":  "Actualización del incidente"
}
```

---

### `DELETE /api/report.php?id=rep-xxx`
Elimina un reporte por ID. Los votos asociados se eliminan en cascada.

---

### `POST /api/vote.php`
Registra un voto (upvote) sobre un reporte activo.

**Body JSON:**
```json
{ "reportId": "rep-xxx" }
```

---

### `PATCH /api/vote.php`
Ejecuta una acción rápida sobre un reporte.

**Body JSON:**
```json
{ "reportId": "rep-xxx", "action": "resolve" }
```
| `action`  | Descripción                              |
|-----------|------------------------------------------|
| `resolve` | Marca el reporte como resuelto           |
| `reopen`  | Reactiva un reporte ya resuelto          |

---

## Estructura de archivos

```
api/
├── config/
│   └── database.php     → Credenciales y función getConnection()
├── helpers/
│   └── response.php     → Funciones: setCorsAndJsonHeaders, sendSuccess, sendError...
├── reports.php          → GET (lista) y POST (crear)
├── report.php           → GET, PUT, DELETE por ID
├── vote.php             → POST (votar) y PATCH (resolver/reabrir)
├── health.php           → Verificación de estado
└── README.md            → Esta documentación
```

---

## Cómo adaptar el frontend (script.js)

Reemplaza las funciones `loadReports()` y `saveReports()` con llamadas `fetch()` a esta API.

**Ejemplo — cargar reportes:**
```javascript
const API = 'http://localhost/statuszona/api';

async function loadReports() {
  const res  = await fetch(`${API}/reports.php`);
  const json = await res.json();
  reports = json.data.reports;
  renderUI();
  updateStats(json.data.activeCount, json.data.resolvedCount);
}
```

**Ejemplo — crear reporte:**
```javascript
async function handleSaveReport() {
  const payload = {
    title:        document.getElementById('form-title').value,
    serviceType:  document.getElementById('form-service-type').value,
    severity:     document.getElementById('form-severity').value,
    location:     document.getElementById('form-location').value,
    lat:          parseFloat(document.getElementById('form-lat').value),
    lng:          parseFloat(document.getElementById('form-lng').value),
    reporterName: document.getElementById('form-reporter').value,
    description:  document.getElementById('form-desc').value,
  };

  const res  = await fetch(`${API}/reports.php`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  const json = await res.json();
  if (json.success) {
    reports.unshift(json.data);
    renderUI();
    closeModal();
  }
}
```

**Ejemplo — votar:**
```javascript
async function upvoteReport(id) {
  const res  = await fetch(`${API}/vote.php`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ reportId: id }),
  });
  const json = await res.json();
  if (json.success) {
    const idx = reports.findIndex(r => r.id === id);
    if (idx !== -1) reports[idx] = json.data;
    renderUI();
  }
}
```

**Ejemplo — resolver:**
```javascript
async function resolveReport(id) {
  await fetch(`${API}/vote.php`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ reportId: id, action: 'resolve' }),
  });
  await loadReports(); // recargar lista completa
}
```
