# Mine Risk Map — Kharkiv Oblast

An interactive geospatial system for collecting, normalizing, storing, and visualizing Mine Risk Education (MRE) session data in Kharkiv Oblast.

The project combines field data collection, centralized storage, and analytical map visualization with filtering, heatmap analysis, and export capabilities.

---

## 1. Project Goal

### Main Goal

To build a unified system that allows:

- fast collection of MRE session data  
- standardized data structure  
- automatic geolocation  
- visualization of coverage  
- analytics and reporting  

### Operational Goals

- eliminate manual Excel/Word processing  
- reduce geolocation errors  
- ensure unified data format across years  
- enable fast coverage analysis  
- simplify donor reporting  

---

## 2. Core Idea

This is not just a map.

It is a **full MRE information system**, working as:

> data input → normalization → storage → geolocation → visualization → analytics → export

---

## 3. Architecture

### General Scheme

```text
Web Form
   ↓
Google Apps Script (doPost)
   ↓
Google Sheets (Database)
   ↓
Google Apps Script (doGet)
   ↓
Frontend (Leaflet Map)
   ↓
Visualization (Markers + Clusters + Heatmap)
```
---
## 4. Data Flow

### 4.1 Input

1. User opens the web form  
2. Fills in:
   - district (raion)  
   - community (hromada)  
   - settlement  
   - date  
   - instructors  
   - participants  

3. Data is sent via POST request  

### 4.2 Storage

- Google Apps Script (`doPost`) receives data  
- validates structure  
- writes a new row into Google Sheets  

### 4.3 Retrieval

- Map calls `doGet()`  
- receives JSON array  

### 4.4 Geolocation

Frontend:

- matches `raion + hromada + settlement`  
- finds coordinates in GeoJSON  

### 4.5 Visualization

- markers are created  
- clusters are built  
- heatmap is generated  

---

## 5. Technologies

### Frontend

- HTML5  
- CSS3  
- Vanilla JavaScript  

### Map

- Leaflet  
- Leaflet.markercluster  
- Leaflet.heat  

### Data & API

- Google Sheets (database)  
- Google Apps Script:
  - `doPost(e)` — write data  
  - `doGet()` — return JSON  

### Export

- html2canvas — map export to PNG  

### Hosting

- GitHub Pages  

### Data Sources

- GeoJSON — coordinates  
- JSON — hierarchical structure (district → community → settlement)  

---

## 6. Project Structure

```text
mine-risk-map/
│
├── data/
│   ├── admin_agg.geojson
│   ├── gromada.geojson
│   ├── kharkiv_settlements_points.geojson
│
├── form/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── locations.json
│
├── index.html
├── README.md
└── ANALYSIS_REPORT.md
```

---

## 7. Map Logic

### 7.1 Markers

Each record = one session.

- displayed as a point  
- contains a popup with details  

### 7.2 Clusters

- group markers when zoomed out  
- expand when zoomed in  

### 7.3 Heatmap

Built using `participants_total`.

Principle:

- more people → stronger intensity  
- fewer people → weaker intensity  

---

## 8. Data Logic

### One record = one session

Even if:

- same date  
- same location  
- same instructors  

These are still separate sessions.

### Data fields

- `created_at`  
- `raion`  
- `hromada`  
- `settlement`  
- `session_date`  
- `instructor_1`  
- `instructor_2`  
- `participants_total`  
- `participants_u18`  
- `participants_18plus`  
- `notes`  

---

## 9. Data Normalization

### Principles

- settlement = name only  
- address → moved to `notes`  
- names must match dictionary  

### Examples

```text
Kharkiv, Shevchenko str → Kharkiv
Lozova, microdistrict → Lozova
```

---
## 10. Geolocation

The project uses a dedicated settlement coordinate dictionary:

```text
data/kharkiv_settlements_points.geojson
```

This file contains point geometries for settlements in Kharkiv Oblast.

Each settlement record is expected to include:

- `raion`
- `hromada`
- `settlement`
- geometry coordinates

The map uses the following matching logic:

```text
raion + hromada + settlement → coordinates from GeoJSON
```

If a settlement from Google Sheets cannot be found in `kharkiv_settlements_points.geojson`, the corresponding session will not be displayed on the map.

This means that data quality in the settlement dictionary is critical for correct visualization.

---

## 11. Filtering

The map supports interactive filtering without page reload.

Available filters:

- date range
- instructor
- district / raion
- community / hromada
- settlement search

### Date range

The user can select:

- start date
- end date

Only sessions within the selected period will be displayed.

### Instructor filter

The map can display sessions conducted by a selected instructor.

The filter checks both instructor fields:

- `instructor_1`
- `instructor_2`

### Raion filter

The map can show only sessions from a selected district.

### Hromada filter

The community list can be filtered according to the selected district.

This prevents incorrect combinations of district and community.

### Search

The search field can be used to find records by:

- raion
- hromada
- settlement

---

## 12. Heatmap Settings

The heatmap is based on beneficiary count, not on the number of sessions.

The main source field is:

```text
participants_total
```

This means that one session with a larger number of beneficiaries has a stronger visual impact than one session with fewer beneficiaries.

### Adjustable parameters

The map includes a heatmap settings panel that allows real-time adjustment of visual parameters.

Available parameters:

- `radius`
- `blur`
- `minOpacity`
- `exponent`
- `minFloor`
- `purpleIntensity`

### Radius

Controls the influence radius of each point.

Higher values create a wider heatmap area.

### Blur

Controls the smoothness of heatmap edges.

Higher values create softer transitions between colors.

### Min opacity

Controls the minimum visibility of the heatmap.

Higher values make the heatmap more visually dense.

### Exponent

Controls the intensity distribution curve.

This parameter affects how strongly medium and low values are displayed compared to high values.

### Min floor

Defines the minimum intensity level for weaker points.

This prevents low-value sessions from becoming invisible.

### Purple intensity

Controls the intensity of the lower-value purple area of the heatmap.

This is useful for making areas with lower beneficiary coverage more visible.

### Real-time update

All heatmap parameters are updated directly on the map without reloading the page.

---

## 13. PNG Export

The map supports PNG export.

This feature is intended for:

- reports
- presentations
- donor documentation
- internal briefings
- quick visual snapshots

### Export behavior

When exporting, the system:

1. temporarily hides service panels if required
2. captures the current map view
3. generates a PNG image
4. downloads the file to the user’s device

### Exported content

The exported PNG may include:

- base map
- session markers
- marker clusters
- heatmap
- currently selected filters and map position

The result depends on the current visible state of the map.

---

## 14. Historical Data Import

Historical MRE session data for previous years was normalized and imported into the same data structure used by the live form.

Processed years:

- 2023
- 2024
- 2025
- 2026

### Import principles

Historical records follow the same logic:

```text
one row = one session
```

Sessions are not merged even if they share:

- the same date
- the same location
- the same instructors

This preserves the real operational structure of multiple sessions conducted during one day.

### Normalized fields

Historical data is normalized into the same Google Sheets schema:

```text
created_at
raion
hromada
settlement
session_date
instructor_1
instructor_2
participants_total
participants_u18
participants_18plus
notes
```

### Missing age data

If older reports do not include age breakdowns, these fields can remain empty:

- `participants_u18`
- `participants_18plus`

The map still works correctly if `participants_total` is present.

---

## 15. Limitations

### Dictionary dependency

The map depends on the settlement dictionary.

If a settlement name in Google Sheets does not exactly match the corresponding record in the GeoJSON dictionary, the point will not be displayed.

### Point-based heatmap

The current heatmap is based on settlement coordinates.

It does not use real settlement or community polygons.

This means that heatmap areas are approximate and visually smoothed around settlement points.

### Historical naming

Some historical data may use older administrative names.

For technical compatibility, names may be normalized to match the working dictionary.

Example:

```text
Berestyn → Krasnohrad
```

This is done only to maintain compatibility with the current geolocation dictionary.

### Google Apps Script limitations

The backend uses Google Apps Script.

This is sufficient for the current scale, but very large datasets or very frequent requests may require a more robust backend in the future.

---

## 16. Future Improvements

Possible future improvements include:

### Data and analytics

- aggregation by community
- aggregation by district
- yearly comparison
- coverage gap analysis
- instructor performance summaries
- age group visualization

### Map layers

- real community polygons
- real district polygons
- polygon-based choropleth maps
- separate heatmap layers by year
- separate heatmap layers by instructor

### Reporting

- automatic report generation
- filtered statistics panel
- export to PDF
- donor-oriented dashboard mode

### User interface

- improved mobile layout
- map display presets
- saved filter states
- language switcher
- public / internal view modes

---

## 17. Quick Start

### Open the map

Open:

```text
https://deafinicio.github.io/mine-risk-map/
```

### Open the form

Open:

```text
https://deafinicio.github.io/mine-risk-map/form/
```

### Add a new session

1. Open the form
2. Select district
3. Select community
4. Select settlement
5. Enter session date
6. Select instructor or instructors
7. Enter beneficiary count
8. Submit the form

### View updated data

1. Open the map
2. Click `Оновити дані`
3. Apply filters if needed

### After code updates

After pushing changes to GitHub Pages:

```text
Ctrl + F5
```

Use hard refresh to avoid browser cache issues.

---

## 18. Summary

Mine Risk Map transforms field MRE data into a structured, visual, and analytical system.

The system allows users to:

- collect data in a standardized way
- store records in Google Sheets
- automatically geolocate sessions
- visualize coverage on a map
- analyze beneficiary reach
- filter by period, instructor, district, and community
- export map snapshots for reports

The project provides a practical tool for operational monitoring, reporting, and evidence-based planning of Mine Risk Education activities in Kharkiv Oblast.
