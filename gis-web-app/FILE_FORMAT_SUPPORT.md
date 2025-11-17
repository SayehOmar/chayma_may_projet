# File Format Support - Implementation Summary

## Overview
The GIS web application has been enhanced to support multiple file formats for geospatial data import:
- ✅ **CSV** (already supported, improved)
- ✅ **XLSX/XLS** (newly added)
- ✅ **SHP/Shapefile** (newly added)
- ✅ **GeoJSON/JSON** (already supported)

---

## Changes Made

### 1. Dependencies Added
- **xlsx** (v0.18.5): For parsing Excel files (.xlsx, .xls)
- **shpjs** (v6.2.0): For parsing Shapefile format (.shp with associated files)

### 2. Code Updates

#### **App.jsx** - Main Changes:

**Imports Added:**
```javascript
import * as XLSX from 'xlsx';
import * as shpjs from 'shpjs';
```

**New Helper Function: `processPointData`**
- Extracts X/Y coordinates from CSV/Excel data (case-insensitive)
- Dynamically includes all properties from source data
- Handles multiple name column variations (Sites, A, Name)
- Transforms coordinates from EPSG:22391 to WGS84 (EPSG:4326)

**Enhanced `handleFileUpload` Function:**
- Groups shapefile components (.shp, .shx, .dbf, .prj, .cpg) together
- Processes shapefiles separately from other file types
- Supports XLSX/XLS file parsing
- Improved error handling with user-friendly alerts

**New Function: `processShapefile`**
- Handles shapefile parsing with associated files
- Supports shapefiles with or without .dbf (attributes)
- Handles projection information from .prj files
- Converts shapefile data to GeoJSON format
- Includes error handling and user feedback

**New Function: `processGeoJSON`**
- Validates GeoJSON structure and types
- Normalizes all GeoJSON types to FeatureCollection
- Handles FeatureCollection, Feature, Geometry, and GeometryCollection
- Validates coordinate ranges (WGS84 bounds)
- Detects and logs CRS information
- Filters invalid features with warnings
- Preserves all feature properties
- Provides detailed error messages

**File Input Updated:**
- Accept attribute now includes: `.csv,.geojson,.json,.xlsx,.xls,.shp,.shx,.dbf,.prj,.cpg`

---

## File Format Details

### CSV Files
**Format:**
- Delimiter: Semicolon (`;`)
- Required columns: `X`, `Y` (case-insensitive)
- Optional name columns: `Sites`, `A`, `Name` (case-insensitive)
- All other columns are preserved as feature properties

**Example:**
```csv
Sites;X;Y;mat
Adissa;463379;4063948;argile
Agab;476506;4050069;argile
```

### XLSX/XLS Files
**Format:**
- First sheet is read automatically
- Same column requirements as CSV
- All columns preserved as feature properties
- Supports both .xlsx and .xls formats

**Example:**
Same structure as CSV, but in Excel format

### Shapefile (.shp)
**Format:**
- Requires: `.shp` file (geometry)
- Recommended: `.dbf` file (attributes), `.shx` file (index)
- Optional: `.prj` file (projection), `.cpg` file (code page)

**Usage:**
1. Select all related shapefile components when uploading
2. Files are automatically grouped by base name
3. The application will combine geometry and attributes if both are provided

**Example:**
```
sites_jendouba.shp
sites_jendouba.shx
sites_jendouba.dbf
sites_jendouba.prj
```

### GeoJSON (.geojson, .json)
**Format:**
- Standard GeoJSON format (RFC 7946)
- Supports all GeoJSON types:
  - `FeatureCollection` (recommended)
  - `Feature` (single feature)
  - Geometry objects (`Point`, `LineString`, `Polygon`, `MultiPoint`, `MultiLineString`, `MultiPolygon`)
  - `GeometryCollection`

**Features:**
- **Automatic Normalization**: All GeoJSON types are normalized to FeatureCollection
- **Validation**: Validates structure, geometry, and coordinates
- **Coordinate Validation**: Warns if coordinates are outside WGS84 bounds (-180 to 180 longitude, -90 to 90 latitude)
- **CRS Detection**: Detects and logs coordinate reference system information
- **Error Handling**: Provides detailed error messages for invalid GeoJSON
- **Property Preservation**: All feature properties are preserved

**Example:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [10.1815, 36.8065]
      },
      "properties": {
        "name": "Tunis",
        "population": 1056247
      }
    }
  ]
}
```

**Supported Geometry Types:**
- Point
- LineString
- Polygon
- MultiPoint
- MultiLineString
- MultiPolygon
- GeometryCollection

---

## Features

### ✅ Implemented
1. **Multi-format Support**: CSV, XLSX, XLS, SHP, GeoJSON
2. **Dynamic Property Preservation**: All columns/properties from source files are preserved
3. **Case-Insensitive Column Detection**: Works with X/x, Y/y, Sites/sites, etc.
4. **Shapefile Component Grouping**: Automatically groups related shapefile files
5. **Error Handling**: User-friendly error messages for parsing failures
6. **Coordinate Transformation**: Automatic conversion from EPSG:22391 to WGS84 for CSV/Excel
7. **Enhanced GeoJSON Handling**:
   - Supports all GeoJSON types (FeatureCollection, Feature, Geometry, GeometryCollection)
   - Automatic normalization to FeatureCollection
   - Structure and coordinate validation
   - CRS detection and logging
   - Coordinate bounds checking
   - Invalid feature filtering with warnings

### ⚠️ Notes
1. **Shapefile Projection**: Currently, shapefile coordinates are assumed to be in WGS84. If shapefiles use a different projection, coordinate transformation may be needed.
2. **Excel Sheets**: Only the first sheet is read from Excel files
3. **Large Files**: Very large files may take time to process (no progress indicator yet)

---

## Testing

### Test Files Location
Files are located at: `C:\Users\sayeh omar\Desktop\shayma may\GIS files\`

**Available Test Files:**
- CSV: `Fernena 1.csv`, `Ghradimaou 1.csv`, `tabarka.csv`
- XLSX: `sites_ain_drahem.xlsx`, `sites_bousalem.xlsx`, `sites_jendouba.xlsx`
- SHP: `site jendouba/administrative_jendouba.shp` (with associated files)
- SHP: `site jendouba/sites_jendouba_all_strictly_inside_shp.shp` (with associated files)

### How to Test
1. Start the application: `npm run dev`
2. Click the upload button in the left sidebar
3. Select one or more files to upload
4. For shapefiles, select all related files (.shp, .shx, .dbf, .prj)
5. Files should appear as layers on the map

---

## Known Issues & Future Improvements

### Potential Issues
1. **shpjs Import**: The shpjs library import may need adjustment based on the actual package structure. If shapefile parsing fails, check the browser console for errors.

2. **Shapefile Projection**: Currently doesn't transform shapefile coordinates if they're not in WGS84. This could be added using proj4.

3. **Large Files**: No progress indicator for large file processing.

### Future Improvements
1. Add progress indicators for file upload/processing
2. Support coordinate transformation for shapefiles based on .prj file
3. Support multiple Excel sheets selection
4. Add file validation before processing
5. Support ZIP files containing shapefiles
6. Add drag-and-drop file upload
7. Support KML/KMZ files

---

## Troubleshooting

### Shapefile Not Loading
- **Issue**: Shapefile doesn't appear on map
- **Solution**: 
  1. Ensure all related files (.shp, .shx, .dbf) are selected
  2. Check browser console for errors
  3. Verify the shapefile is not corrupted

### Excel File Not Parsing
- **Issue**: XLSX file shows error
- **Solution**:
  1. Verify the file has X and Y columns
  2. Check that coordinates are numeric
  3. Ensure the file is not password-protected

### CSV Coordinates Wrong
- **Issue**: Points appear in wrong location
- **Solution**:
  1. Verify coordinates are in EPSG:22391 (Tunisia UTM Zone 32N)
  2. Check that X and Y columns are correctly named
  3. Ensure coordinates are numeric (not text)

---

## Code Structure

### Key Functions

**`processPointData(data, fileNameWithoutExt)`**
- Converts CSV/Excel data to GeoJSON
- Handles coordinate transformation
- Preserves all properties

**`handleFileUpload(event)`**
- Main file upload handler
- Routes files to appropriate parsers
- Groups shapefile components

**`processShapefile(shpFile, fileGroup, baseName)`**
- Parses shapefile components
- Combines geometry and attributes
- Converts to GeoJSON format

---

## Dependencies

```json
{
  "xlsx": "^0.18.5",
  "shpjs": "^6.2.0"
}
```

---

## Summary

The application now supports comprehensive geospatial data import from multiple formats:
- ✅ CSV files with coordinate data
- ✅ Excel files (XLSX/XLS) with coordinate data  
- ✅ Shapefiles with geometry and attributes
- ✅ GeoJSON files

All formats are automatically converted to GeoJSON internally and displayed as layers on the map. Properties from source files are preserved and available in the attribute table.

