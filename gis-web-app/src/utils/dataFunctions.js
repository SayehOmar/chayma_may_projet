/**
 * Static utility functions for data analysis and manipulation
 * Based on the GIS data structure (CSV with Sites, X, Y, mat, etc.)
 */

/**
 * Get statistics for a layer
 * @param {Object} layer - Layer object with data.features
 * @returns {Object} Statistics object
 */
export const getLayerStatistics = (layer) => {
    if (!layer || !layer.data || !layer.data.features || layer.data.features.length === 0) {
        return null;
    }

    const features = layer.data.features;
    const stats = {
        totalFeatures: features.length,
        geometryTypes: {},
        properties: {},
        materialCount: {},
        regionCount: {},
        movedCount: 0,
        inRegionCount: 0
    };

    features.forEach(feature => {
        // Count geometry types
        const geomType = feature.geometry?.type || 'Unknown';
        stats.geometryTypes[geomType] = (stats.geometryTypes[geomType] || 0) + 1;

        // Count by material (mat property)
        if (feature.properties.mat) {
            const mat = feature.properties.mat.toString().toLowerCase().trim();
            stats.materialCount[mat] = (stats.materialCount[mat] || 0) + 1;
        }

        // Count by region (in_region property)
        if (feature.properties.in_region !== undefined) {
            if (feature.properties.in_region === 1 || feature.properties.in_region === true) {
                stats.inRegionCount++;
            }
        }

        // Count moved features
        if (feature.properties.was_moved !== undefined) {
            if (feature.properties.was_moved === 1 || feature.properties.was_moved === true) {
                stats.movedCount++;
            }
        }

        // Analyze all properties
        Object.keys(feature.properties).forEach(key => {
            if (!stats.properties[key]) {
                stats.properties[key] = {
                    type: typeof feature.properties[key],
                    uniqueValues: new Set(),
                    nullCount: 0
                };
            }
            const value = feature.properties[key];
            if (value === null || value === undefined || value === '') {
                stats.properties[key].nullCount++;
            } else {
                stats.properties[key].uniqueValues.add(value.toString());
            }
        });
    });

    // Convert Sets to counts
    Object.keys(stats.properties).forEach(key => {
        stats.properties[key].uniqueCount = stats.properties[key].uniqueValues.size;
        stats.properties[key].uniqueValues = Array.from(stats.properties[key].uniqueValues).slice(0, 10); // First 10 unique values
    });

    return stats;
};

/**
 * Filter features by property value
 * @param {Object} layer - Layer object
 * @param {String} property - Property name to filter by
 * @param {*} value - Value to filter for
 * @returns {Object} New layer with filtered features
 */
export const filterByProperty = (layer, property, value) => {
    if (!layer || !layer.data || !layer.data.features) {
        return null;
    }

    const filteredFeatures = layer.data.features.filter(feature => {
        const propValue = feature.properties[property];
        if (typeof value === 'string') {
            return propValue?.toString().toLowerCase().includes(value.toLowerCase());
        }
        return propValue === value;
    });

    return {
        ...layer,
        data: {
            ...layer.data,
            features: filteredFeatures
        }
    };
};

/**
 * Filter by material type
 * @param {Object} layer - Layer object
 * @param {String} material - Material type (e.g., 'argile', 'sable')
 * @returns {Object} Filtered layer
 */
export const filterByMaterial = (layer, material) => {
    return filterByProperty(layer, 'mat', material);
};

/**
 * Group features by property
 * @param {Object} layer - Layer object
 * @param {String} property - Property to group by
 * @returns {Object} Object with groups
 */
export const groupByProperty = (layer, property) => {
    if (!layer || !layer.data || !layer.data.features) {
        return {};
    }

    const groups = {};
    layer.data.features.forEach(feature => {
        const value = feature.properties[property];
        const key = value?.toString() || 'Unknown';
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(feature);
    });

    return groups;
};

/**
 * Get unique values for a property
 * @param {Object} layer - Layer object
 * @param {String} property - Property name
 * @returns {Array} Array of unique values
 */
export const getUniqueValues = (layer, property) => {
    if (!layer || !layer.data || !layer.data.features) {
        return [];
    }

    const values = new Set();
    layer.data.features.forEach(feature => {
        const value = feature.properties[property];
        if (value !== null && value !== undefined && value !== '') {
            values.add(value.toString());
        }
    });

    return Array.from(values).sort();
};

/**
 * Calculate bounding box/extent
 * @param {Object} layer - Layer object
 * @returns {Object} Bounding box {minX, minY, maxX, maxY, center}
 */
export const calculateExtent = (layer) => {
    if (!layer || !layer.data || !layer.data.features || layer.data.features.length === 0) {
        return null;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    layer.data.features.forEach(feature => {
        if (feature.geometry && feature.geometry.coordinates) {
            const coords = feature.geometry.coordinates;
            
            if (feature.geometry.type === 'Point') {
                const [lon, lat] = coords;
                minX = Math.min(minX, lon);
                minY = Math.min(minY, lat);
                maxX = Math.max(maxX, lon);
                maxY = Math.max(maxY, lat);
            } else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiPoint') {
                coords.forEach(coord => {
                    const [lon, lat] = coord;
                    minX = Math.min(minX, lon);
                    minY = Math.min(minY, lat);
                    maxX = Math.max(maxX, lon);
                    maxY = Math.max(maxY, lat);
                });
            } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiLineString') {
                coords.forEach(ring => {
                    ring.forEach(coord => {
                        const [lon, lat] = coord;
                        minX = Math.min(minX, lon);
                        minY = Math.min(minY, lat);
                        maxX = Math.max(maxX, lon);
                        maxY = Math.max(maxY, lat);
                    });
                });
            }
        }
    });

    return {
        minX,
        minY,
        maxX,
        maxY,
        center: [(minX + maxX) / 2, (minY + maxY) / 2],
        width: maxX - minX,
        height: maxY - minY
    };
};

/**
 * Export layer to CSV format
 * @param {Object} layer - Layer object
 * @returns {String} CSV string
 */
export const exportToCSV = (layer) => {
    if (!layer || !layer.data || !layer.data.features || layer.data.features.length === 0) {
        return '';
    }

    const features = layer.data.features;
    const properties = Object.keys(features[0].properties);
    
    // Add coordinate columns
    const headers = ['Name', 'Longitude', 'Latitude', ...properties];
    
    const rows = features.map(feature => {
        const coords = feature.geometry?.coordinates || [];
        const lon = coords[0] || '';
        const lat = coords[1] || '';
        const name = feature.properties.name || feature.properties.Nom || feature.properties.Sites || '';
        
        const values = [name, lon, lat, ...properties.map(prop => feature.properties[prop] || '')];
        return values.map(v => `"${v.toString().replace(/"/g, '""')}"`).join(';');
    });

    return [headers.map(h => `"${h}"`).join(';'), ...rows].join('\n');
};

/**
 * Export layer to GeoJSON
 * @param {Object} layer - Layer object
 * @returns {String} GeoJSON string
 */
export const exportToGeoJSON = (layer) => {
    if (!layer || !layer.data) {
        return '';
    }

    return JSON.stringify(layer.data, null, 2);
};

/**
 * Get summary text for a layer
 * @param {Object} layer - Layer object
 * @returns {String} Summary text
 */
export const getLayerSummary = (layer) => {
    if (!layer || !layer.data || !layer.data.features) {
        return 'No data available';
    }

    const stats = getLayerStatistics(layer);
    if (!stats) {
        return 'No features in layer';
    }

    const materialSummary = Object.keys(stats.materialCount).length > 0
        ? `Materials: ${Object.entries(stats.materialCount).map(([mat, count]) => `${mat} (${count})`).join(', ')}`
        : '';

    const regionSummary = stats.inRegionCount > 0
        ? `${stats.inRegionCount} features in region`
        : '';

    return [
        `${stats.totalFeatures} features`,
        Object.keys(stats.geometryTypes).map(type => `${type}: ${stats.geometryTypes[type]}`).join(', '),
        materialSummary,
        regionSummary
    ].filter(Boolean).join(' | ');
};

/**
 * Count features by category
 * @param {Object} layer - Layer object
 * @param {String} categoryProperty - Property name to use for categorization
 * @returns {Object} Count object
 */
export const countByCategory = (layer, categoryProperty) => {
    if (!layer || !layer.data || !layer.data.features) {
        return {};
    }

    const counts = {};
    layer.data.features.forEach(feature => {
        const category = feature.properties[categoryProperty]?.toString() || 'Unknown';
        counts[category] = (counts[category] || 0) + 1;
    });

    return counts;
};

