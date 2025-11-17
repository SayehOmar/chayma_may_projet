import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getLayerStatistics, countByCategory } from '../utils/dataFunctions';
import './StatisticsWindow.css';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const StatisticsWindow = ({ layer, onClose }) => {
    const [position, setPosition] = useState({ x: 100, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isMinimized, setIsMinimized] = useState(false);
    const [selectedAttributes, setSelectedAttributes] = useState({ material: true, sites: false });
    const [customAttribute, setCustomAttribute] = useState('');
    const [xAxisAttribute, setXAxisAttribute] = useState('');
    const [yAxisAttribute, setYAxisAttribute] = useState('');
    const windowRef = useRef(null);
    const animationFrameRef = useRef(null);

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
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value),
        [materialCounts]
    );

    const customAttributeData = useMemo(() => 
        Object.entries(customAttributeCounts)
            .map(([name, value]) => ({ name: name.length > 20 ? name.substring(0, 20) + '...' : name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 15),
        [customAttributeCounts]
    );

    // Correlation data: X axis vs Y axis
    const correlationData = useMemo(() => {
        if (!xAxisAttribute || !yAxisAttribute || !layer?.data?.features) return [];
        
        // Group by X axis, then count Y axis values
        const grouped = {};
        
        layer.data.features.forEach(feature => {
            const xValue = feature.properties[xAxisAttribute]?.toString() || 'Unknown';
            const yValue = feature.properties[yAxisAttribute]?.toString() || 'Unknown';
            
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
            const dataPoint = { name: xVal.length > 20 ? xVal.substring(0, 20) + '...' : xVal };
            yValues.forEach(yVal => {
                // Clean Y value name for use as dataKey
                const cleanYVal = yVal.length > 15 ? yVal.substring(0, 15) + '...' : yVal;
                dataPoint[cleanYVal] = grouped[xVal][yVal] || 0;
            });
            return dataPoint;
        }).slice(0, 20); // Limit to top 20 X values
    }, [xAxisAttribute, yAxisAttribute, layer]);

    // Get unique Y values for legend
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
        return Array.from(yValues);
    }, [correlationData]);

    const handleMouseDown = useCallback((e) => {
        if (e.target.closest('.window-controls')) return;
        if (e.target.closest('button')) return;
        if (e.target.closest('select')) return;
        if (e.target.closest('input')) return;
        setIsDragging(true);
        const rect = windowRef.current.getBoundingClientRect();
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    }, []);

    const handleMinimize = useCallback(() => {
        setIsMinimized(prev => !prev);
    }, []);

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
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            
            animationFrameRef.current = requestAnimationFrame(() => {
                if (windowRef.current) {
                    const newX = e.clientX - dragOffset.x;
                    const newY = e.clientY - dragOffset.y;
                    const rect = windowRef.current.getBoundingClientRect();
                    const maxX = window.innerWidth - rect.width;
                    const maxY = window.innerHeight - rect.height;
                    
                    setPosition({
                        x: Math.max(0, Math.min(newX, maxX)),
                        y: Math.max(0, Math.min(newY, maxY))
                    });
                }
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };

        document.addEventListener('mousemove', handleMouseMove, { passive: true });
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'move';
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
    }, [isDragging, dragOffset]);

    if (!layer || !stats) {
        return null;
    }

    return (
        <div 
            className={`statistics-window ${isDragging ? 'dragging' : ''} ${isMinimized ? 'minimized' : ''}`}
            ref={windowRef}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`
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
                        <div className="stat-card">
                            <div className="stat-value">{stats.totalFeatures}</div>
                            <div className="stat-label">Total Features</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{Object.keys(materialCounts).length}</div>
                            <div className="stat-label">Material Types</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{availableAttributes.length}</div>
                            <div className="stat-label">Attributes</div>
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
                                        <Tooltip animationDuration={200} />
                                        <Legend />
                                        {correlationYValues.map((yVal, index) => (
                                            <Bar 
                                                key={yVal} 
                                                dataKey={yVal} 
                                                stackId="a"
                                                fill={COLORS[index % COLORS.length]}
                                                animationDuration={300}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
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
        </div>
    );
};

export default StatisticsWindow;

