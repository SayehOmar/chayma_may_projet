import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getLayerStatistics, countByCategory } from '../utils/dataFunctions';
import './StatisticsWindow.css';

// Custom Tooltip component for correlation chart
const CustomCorrelationTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    
    // Sort payload to show hovered bar first (highest value first)
    const sortedPayload = [...payload].sort((a, b) => {
        return (b.value || 0) - (a.value || 0);
    });
    
    // Measure text width accurately using canvas
    const measureTextWidth = (text, fontSize, fontWeight = 'normal') => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        // Use the same font as the tooltip
        context.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
        return context.measureText(text).width;
    };
    
    // Measure label width (font size 14px, font-weight 600)
    const labelText = label || 'Unknown';
    const labelWidth = measureTextWidth(labelText, 14, '600');
    
    // Measure each item's full width (name + value + spacing)
    let maxItemWidth = 0;
    sortedPayload.forEach(item => {
        const nameText = `${item.name || 'Unknown'}:`;
        const valueText = String(item.value || 0);
        const nameWidth = measureTextWidth(nameText, 13, '500');
        const valueWidth = measureTextWidth(valueText, 13, '600');
        // Account for space-between layout (approximately 20-30px gap)
        const itemWidth = nameWidth + valueWidth + 25;
        maxItemWidth = Math.max(maxItemWidth, itemWidth);
    });
    
    // Calculate total width: max of label or items + padding (12px left + 12px right = 24px)
    const contentWidth = Math.max(labelWidth, maxItemWidth);
    const tooltipWidth = Math.max(200, contentWidth + 24);
    
    return (
        <div 
            className="custom-correlation-tooltip"
            style={{ 
                width: `${tooltipWidth}px`,
                minWidth: '200px'
            }}
        >
            <p className="tooltip-label">{labelText}</p>
            {sortedPayload.map((entry, index) => (
                <p key={index} className="tooltip-item" style={{ color: entry.color }}>
                    <span className="tooltip-name">{entry.name || 'Unknown'}:</span>
                    <span className="tooltip-value">{entry.value || 0}</span>
                </p>
            ))}
        </div>
    );
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const StatisticsWindow = ({ layer, onClose }) => {
    const [position, setPosition] = useState({ x: 100, y: 100 });
    const [size, setSize] = useState({ width: 900, height: 600 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isResizing, setIsResizing] = useState({ width: false, height: false, corner: false });
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const [isMinimized, setIsMinimized] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [previousSize, setPreviousSize] = useState({ width: 900, height: 600 });
    const [previousPosition, setPreviousPosition] = useState({ x: 100, y: 100 });
    const [selectedAttributes, setSelectedAttributes] = useState({ material: true, sites: false });
    const [customAttribute, setCustomAttribute] = useState('');
    const [xAxisAttribute, setXAxisAttribute] = useState('');
    const [yAxisAttribute, setYAxisAttribute] = useState('');
    const windowRef = useRef(null);
    const animationFrameRef = useRef(null);

    // Normalize value for consistent categorization
    const normalizeValue = useCallback((value) => {
        if (value === null || value === undefined || value === '') {
            return 'Unknown';
        }
        return value.toString().trim().toLowerCase();
    }, []);

    // Capitalize first letter of each word for display
    const capitalizeForDisplay = useCallback((str) => {
        if (!str || str === 'Unknown') return str;
        return str.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
    }, []);

    // Memoize expensive calculations
    const stats = useMemo(() => layer ? getLayerStatistics(layer) : null, [layer]);
    
    // Get available attributes
    const availableAttributes = useMemo(() => {
        if (!layer?.data?.features?.[0]?.properties) return [];
        return Object.keys(layer.data.features[0].properties).filter(attr => 
            attr.toLowerCase() !== 'x' && 
            attr.toLowerCase() !== 'y' && 
            attr.toLowerCase() !== 'lon' && 
            attr.toLowerCase() !== 'lat'
        );
    }, [layer]);

    
    const materialCounts = useMemo(() => 
        stats?.materialCount || {}, 
        [stats]
    );

    // Custom attribute counts
    const customAttributeCounts = useMemo(() => {
        if (!customAttribute || !layer) return {};
        return countByCategory(layer, customAttribute);
    }, [layer, customAttribute]);

    // Removed siteData - sites distribution chart removed

    const materialData = useMemo(() => 
        Object.entries(materialCounts)
            .map(([name, value]) => ({ name: capitalizeForDisplay(name), value, originalName: name }))
            .sort((a, b) => b.value - a.value),
        [materialCounts, capitalizeForDisplay]
    );

    const customAttributeData = useMemo(() => 
        Object.entries(customAttributeCounts)
            .map(([name, value]) => ({ 
                name: (name.length > 20 ? name.substring(0, 20) + '...' : capitalizeForDisplay(name)), 
                value 
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 15),
        [customAttributeCounts, capitalizeForDisplay]
    );

    // Correlation data: X axis vs Y axis
    const correlationData = useMemo(() => {
        if (!xAxisAttribute || !yAxisAttribute || !layer?.data?.features) return [];
        
        // Group by X axis, then count Y axis values
        const grouped = {};
        
        layer.data.features.forEach(feature => {
            const xValue = normalizeValue(feature.properties[xAxisAttribute]);
            const yValue = normalizeValue(feature.properties[yAxisAttribute]);
            
            if (!grouped[xValue]) {
                grouped[xValue] = {};
            }
            if (!grouped[xValue][yValue]) {
                grouped[xValue][yValue] = 0;
            }
            grouped[xValue][yValue]++;
        });

        // Convert to chart format
        const xValues = Object.keys(grouped).sort();
        const allYValues = new Set();
        Object.values(grouped).forEach(group => {
            Object.keys(group).forEach(yVal => allYValues.add(yVal));
        });
        const yValues = Array.from(allYValues).sort();

        // Create data array for stacked bar chart
        // Use a fixed key for X axis data
        return xValues.map(xVal => {
            const displayXVal = xVal.length > 20 ? xVal.substring(0, 20) + '...' : capitalizeForDisplay(xVal);
            const dataPoint = { name: displayXVal };
            yValues.forEach(yVal => {
                // Clean Y value name for use as dataKey (keep normalized for grouping, but display capitalized)
                const cleanYVal = yVal.length > 15 ? yVal.substring(0, 15) + '...' : yVal;
                dataPoint[cleanYVal] = grouped[xVal][yVal] || 0;
            });
            return dataPoint;
        }).slice(0, 20); // Limit to top 20 X values
    }, [xAxisAttribute, yAxisAttribute, layer, normalizeValue, capitalizeForDisplay]);

    // Get unique Y values for legend (with display names)
    const correlationYValues = useMemo(() => {
        if (!correlationData.length || !yAxisAttribute) return [];
        const yValues = new Set();
        correlationData.forEach(item => {
            Object.keys(item).forEach(key => {
                if (key !== 'name' && typeof item[key] === 'number') {
                    yValues.add(key);
                }
            });
        });
        return Array.from(yValues).map(val => ({
            key: val,
            displayName: capitalizeForDisplay(val)
        }));
    }, [correlationData, capitalizeForDisplay]);

    // Pie chart data for correlation (total count per Y value)
    const correlationPieData = useMemo(() => {
        if (!correlationData.length || !correlationYValues.length) return [];
        
        // Calculate total count for each Y value across all X values
        const totals = {};
        correlationYValues.forEach(yVal => {
            totals[yVal.key] = 0;
        });
        
        correlationData.forEach(item => {
            correlationYValues.forEach(yVal => {
                totals[yVal.key] += item[yVal.key] || 0;
            });
        });
        
        // Convert to pie chart format
        return correlationYValues.map((yVal, index) => ({
            name: yVal.displayName,
            value: totals[yVal.key],
            color: COLORS[index % COLORS.length]
        })).filter(item => item.value > 0).sort((a, b) => b.value - a.value);
    }, [correlationData, correlationYValues]);

    const handleMouseDown = useCallback((e) => {
        if (e.target.closest('.window-controls')) return;
        if (e.target.closest('button')) return;
        if (e.target.closest('select')) return;
        if (e.target.closest('input')) return;
        if (e.target.closest('.resize-handle')) return;
        // Don't allow dragging when maximized
        if (isMaximized) return;
        setIsDragging(true);
        const rect = windowRef.current.getBoundingClientRect();
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    }, [isMaximized]);

    const handleResizeStart = useCallback((e, type) => {
        e.preventDefault();
        e.stopPropagation();
        // Don't allow resizing when maximized
        if (isMaximized) return;
        const rect = windowRef.current.getBoundingClientRect();
        setResizeStart({
            x: e.clientX,
            y: e.clientY,
            width: rect.width,
            height: rect.height
        });
        if (type === 'corner') {
            setIsResizing({ width: true, height: true, corner: true });
        } else if (type === 'width') {
            setIsResizing({ width: true, height: false, corner: false });
        } else if (type === 'height') {
            setIsResizing({ width: false, height: true, corner: false });
        }
    }, [isMaximized]);

    const handleMinimize = useCallback(() => {
        setIsMinimized(prev => !prev);
    }, []);

    const handleMaximize = useCallback(() => {
        if (isMaximized) {
            // Restore to previous size and position
            setSize(previousSize);
            setPosition(previousPosition);
            setIsMaximized(false);
        } else {
            // Save current size and position
            setPreviousSize(size);
            setPreviousPosition(position);
            
            // Maximize to full page dimensions (no margins)
            setSize({
                width: window.innerWidth,
                height: window.innerHeight
            });
            
            // Position at top-left corner
            setPosition({
                x: 0,
                y: 0
            });
            
            setIsMaximized(true);
        }
    }, [isMaximized, size, position, previousSize, previousPosition]);

    const handleAttributeChange = useCallback((attr, checked) => {
        setSelectedAttributes(prev => ({ ...prev, [attr]: checked }));
    }, []);

    const handleCustomAttributeChange = useCallback((value) => {
        setCustomAttribute(value);
        if (value) {
            setSelectedAttributes(prev => ({ ...prev, [value]: true }));
        }
    }, []);

    // Constrain window to viewport
    useEffect(() => {
        if (windowRef.current) {
            const rect = windowRef.current.getBoundingClientRect();
            const maxX = window.innerWidth - rect.width;
            const maxY = window.innerHeight - rect.height;
            
            setPosition(prev => ({
                x: Math.max(0, Math.min(prev.x, maxX)),
                y: Math.max(0, Math.min(prev.y, maxY))
            }));
        }
    }, []);

    useEffect(() => {
        if (!isDragging && !isResizing.width && !isResizing.height) return;

        const handleMouseMove = (e) => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            
            animationFrameRef.current = requestAnimationFrame(() => {
                if (windowRef.current) {
                    if (isDragging) {
                        const newX = e.clientX - dragOffset.x;
                        const newY = e.clientY - dragOffset.y;
                        const rect = windowRef.current.getBoundingClientRect();
                        const maxX = window.innerWidth - rect.width;
                        const maxY = window.innerHeight - rect.height;
                        
                        setPosition({
                            x: Math.max(0, Math.min(newX, maxX)),
                            y: Math.max(0, Math.min(newY, maxY))
                        });
                    } else if (isResizing.width || isResizing.height) {
                        const deltaX = e.clientX - resizeStart.x;
                        const deltaY = e.clientY - resizeStart.y;
                        
                        let newWidth = resizeStart.width;
                        let newHeight = resizeStart.height;
                        
                        if (isResizing.width || isResizing.corner) {
                            newWidth = Math.max(400, Math.min(1600, resizeStart.width + deltaX));
                        }
                        
                        if (isResizing.height || isResizing.corner) {
                            newHeight = Math.max(300, Math.min(window.innerHeight - position.y - 50, resizeStart.height + deltaY));
                        }
                        
                        setSize({ width: newWidth, height: newHeight });
                        
                        // Adjust position if resizing from right edge to keep left edge fixed
                        if (isResizing.width || isResizing.corner) {
                            const rect = windowRef.current.getBoundingClientRect();
                            const maxX = window.innerWidth - newWidth;
                            if (position.x > maxX) {
                                setPosition(prev => ({
                                    ...prev,
                                    x: Math.max(0, maxX)
                                }));
                            }
                        }
                    }
                }
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing({ width: false, height: false, corner: false });
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };

        document.addEventListener('mousemove', handleMouseMove, { passive: true });
        document.addEventListener('mouseup', handleMouseUp);
        
        if (isDragging) {
            document.body.style.cursor = 'move';
        } else if (isResizing.corner) {
            document.body.style.cursor = 'nwse-resize';
        } else if (isResizing.width) {
            document.body.style.cursor = 'ew-resize';
        } else if (isResizing.height) {
            document.body.style.cursor = 'ns-resize';
        }
        
        document.body.style.userSelect = 'none';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isDragging, dragOffset, isResizing, resizeStart, position]);

    if (!layer || !stats) {
        return null;
    }

    return (
        <div 
            className={`statistics-window ${isDragging ? 'dragging' : ''} ${isResizing.width || isResizing.height ? 'resizing' : ''} ${isMinimized ? 'minimized' : ''} ${isMaximized ? 'maximized' : ''}`}
            ref={windowRef}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${size.width}px`,
                height: `${isMinimized ? 'auto' : `${size.height}px`}`
            }}
        >
            <div className="window-header" onMouseDown={handleMouseDown}>
                <div className="window-title">
                    <i className="fas fa-chart-bar" style={{ marginRight: '8px' }}></i>
                    Statistics: {layer.name}
                </div>
                <div className="window-controls">
                    <button className="window-control-btn minimize" onClick={handleMinimize} title="Minimize">
                        <i className="fas fa-minus"></i>
                    </button>
                    <button className="window-control-btn maximize" onClick={handleMaximize} title={isMaximized ? "Restore" : "Maximize to Full Screen"}>
                        <i className={isMaximized ? "fas fa-compress" : "fas fa-expand"}></i>
                    </button>
                    <button className="window-control-btn close" onClick={onClose} title="Close">
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            {!isMinimized && (
                <div className="window-content">
                    {/* Attribute Selection */}
                    <div className="attribute-selector-section">
                        <h3 className="chart-title">
                            <i className="fas fa-filter" style={{ marginRight: '8px' }}></i>
                            Select Attributes to Display
                        </h3>
                        <div className="attribute-checkboxes">
                            <label className="attribute-checkbox">
                                <input
                                    type="checkbox"
                                    checked={selectedAttributes.material}
                                    onChange={(e) => handleAttributeChange('material', e.target.checked)}
                                />
                                <span>Material/Nature (mat)</span>
                            </label>
                        </div>
                        <div className="custom-attribute-selector">
                            <label>Custom Attribute:</label>
                            <select
                                value={customAttribute}
                                onChange={(e) => handleCustomAttributeChange(e.target.value)}
                                className="attribute-select"
                            >
                                <option value="">-- Select Attribute --</option>
                                {availableAttributes.map(attr => (
                                    <option key={attr} value={attr}>{attr}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="correlation-selector">
                            <h4 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: '#374151' }}>
                                <i className="fas fa-chart-line" style={{ marginRight: '6px' }}></i>
                                Correlation Analysis
                            </h4>
                            <div className="axis-selectors">
                                <div className="axis-selector">
                                    <label>X Axis:</label>
                                    <select
                                        value={xAxisAttribute}
                                        onChange={(e) => setXAxisAttribute(e.target.value)}
                                        className="attribute-select"
                                    >
                                        <option value="">-- Select X Axis --</option>
                                        {availableAttributes.map(attr => (
                                            <option key={attr} value={attr}>{attr}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="axis-selector">
                                    <label>Y Axis:</label>
                                    <select
                                        value={yAxisAttribute}
                                        onChange={(e) => setYAxisAttribute(e.target.value)}
                                        className="attribute-select"
                                    >
                                        <option value="">-- Select Y Axis --</option>
                                        {availableAttributes.map(attr => (
                                            <option key={attr} value={attr}>{attr}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {xAxisAttribute && yAxisAttribute && (
                                <p style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
                                    Showing relationship between {xAxisAttribute} and {yAxisAttribute}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="stats-summary">
                        <div className="stat-card stat-card-small">
                            <div className="stat-value stat-value-small">{stats.totalFeatures}</div>
                            <div className="stat-label stat-label-small">Total Features</div>
                        </div>
                        <div className="stat-card stat-card-small">
                            <div className="stat-value stat-value-small">{availableAttributes.length}</div>
                            <div className="stat-label stat-label-small">Attributes</div>
                        </div>
                    </div>

                    <div className="charts-container">
                        {/* Material/Nature Distribution - Pie Chart */}
                        {selectedAttributes.material && materialData.length > 0 && (
                            <div className="chart-section">
                                <h3 className="chart-title">
                                    <i className="fas fa-pie-chart" style={{ marginRight: '8px' }}></i>
                                    Material Distribution (Nature)
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={materialData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                            outerRadius={100}
                                            fill="#8884d8"
                                            dataKey="value"
                                            animationDuration={300}
                                        >
                                            {materialData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip animationDuration={200} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Material/Nature Distribution - Bar Chart */}
                        {selectedAttributes.material && materialData.length > 0 && (
                            <div className="chart-section">
                                <h3 className="chart-title">
                                    <i className="fas fa-chart-bar" style={{ marginRight: '8px' }}></i>
                                    Material Count (Bar Chart)
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={materialData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" />
                                        <YAxis />
                                        <Tooltip animationDuration={200} />
                                        <Legend />
                                        <Bar dataKey="value" fill="#3b82f6" animationDuration={300} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Correlation Chart - X vs Y Axis */}
                        {xAxisAttribute && yAxisAttribute && correlationData.length > 0 && (
                            <div className="chart-section">
                                <h3 className="chart-title">
                                    <i className="fas fa-project-diagram" style={{ marginRight: '8px' }}></i>
                                    Correlation: {xAxisAttribute} vs {yAxisAttribute}
                                </h3>
                                {/* Custom Legend on top */}
                                <div className="correlation-legend-top">
                                    {correlationYValues.map((yVal, index) => (
                                        <div key={yVal.key} className="legend-item-top">
                                            <span 
                                                className="legend-color-indicator" 
                                                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                            ></span>
                                            <span className="legend-label">{yVal.displayName}</span>
                                        </div>
                                    ))}
                                </div>
                                <ResponsiveContainer width="100%" height={400}>
                                    <BarChart 
                                        data={correlationData} 
                                        margin={{ top: 5, right: 30, left: 20, bottom: 100 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis 
                                            dataKey="name" 
                                            angle={-45} 
                                            textAnchor="end" 
                                            height={100}
                                            label={{ value: xAxisAttribute, position: 'insideBottom', offset: -5 }}
                                        />
                                        <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
                                        <Tooltip 
                                            content={<CustomCorrelationTooltip />}
                                            animationDuration={200}
                                        />
                                        {correlationYValues.map((yVal, index) => (
                                            <Bar 
                                                key={yVal.key} 
                                                dataKey={yVal.key} 
                                                stackId="a"
                                                fill={COLORS[index % COLORS.length]}
                                                animationDuration={300}
                                                name={yVal.displayName}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                                
                                {/* Pie Chart for Correlation Distribution */}
                                {correlationPieData.length > 0 && (
                                    <div style={{ marginTop: '32px' }}>
                                        <h4 className="chart-title" style={{ fontSize: '14px', marginBottom: '12px' }}>
                                            <i className="fas fa-pie-chart" style={{ marginRight: '8px' }}></i>
                                            Distribution of {yAxisAttribute}
                                        </h4>
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie
                                                    data={correlationPieData}
                                                    cx="50%"
                                                    cy="50%"
                                                    labelLine={false}
                                                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                                    outerRadius={100}
                                                    fill="#8884d8"
                                                    dataKey="value"
                                                    animationDuration={300}
                                                >
                                                    {correlationPieData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip animationDuration={200} />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Custom Attribute Chart */}
                        {customAttribute && customAttributeData.length > 0 && (
                            <div className="chart-section">
                                <h3 className="chart-title">
                                    <i className="fas fa-chart-line" style={{ marginRight: '8px' }}></i>
                                    {customAttribute} Distribution
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={customAttributeData} margin={{ top: 5, right: 30, left: 20, bottom: 100 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                        <YAxis />
                                        <Tooltip animationDuration={200} />
                                        <Legend />
                                        <Bar dataKey="value" fill="#8b5cf6" animationDuration={300} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Material Table */}
                        {selectedAttributes.material && materialData.length > 0 && (
                            <div className="chart-section">
                                <h3 className="chart-title">
                                    <i className="fas fa-table" style={{ marginRight: '8px' }}></i>
                                    Material Summary
                                </h3>
                                <div className="material-table">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Material</th>
                                                <th>Count</th>
                                                <th>Percentage</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {materialData.map((item, index) => {
                                                const percentage = ((item.value / stats.totalFeatures) * 100).toFixed(1);
                                                return (
                                                    <tr key={item.name}>
                                                        <td>
                                                            <span 
                                                                className="color-indicator" 
                                                                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                                            ></span>
                                                            {item.name}
                                                        </td>
                                                        <td>{item.value}</td>
                                                        <td>{percentage}%</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Resize handles */}
            {!isMinimized && (
                <>
                    <div 
                        className="resize-handle resize-handle-right"
                        onMouseDown={(e) => handleResizeStart(e, 'width')}
                    ></div>
                    <div 
                        className="resize-handle resize-handle-bottom"
                        onMouseDown={(e) => handleResizeStart(e, 'height')}
                    ></div>
                    <div 
                        className="resize-handle resize-handle-corner"
                        onMouseDown={(e) => handleResizeStart(e, 'corner')}
                    ></div>
                </>
            )}
        </div>
    );
};

export default StatisticsWindow;

