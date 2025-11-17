import React, { useState, useRef, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getLayerStatistics, countByCategory } from '../utils/dataFunctions';
import './StatisticsWindow.css';

const StatisticsWindow = ({ layer, onClose }) => {
    const [position, setPosition] = useState({ x: 100, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isMinimized, setIsMinimized] = useState(false);
    const windowRef = useRef(null);

    const stats = layer ? getLayerStatistics(layer) : null;
    
    // Try different property names for sites
    const siteProperty = layer?.data?.features?.[0]?.properties ? 
        (Object.keys(layer.data.features[0].properties).find(key => 
            key.toLowerCase() === 'sites' || 
            key.toLowerCase() === 'name' || 
            key.toLowerCase() === 'nom' ||
            key.toLowerCase() === 'a'
        ) || 'name') : 'name';
    
    const siteCounts = layer ? countByCategory(layer, siteProperty) : {};
    const materialCounts = stats?.materialCount || {};

    // Prepare data for charts
    const siteData = Object.entries(siteCounts)
        .map(([name, count]) => ({ name: name.length > 15 ? name.substring(0, 15) + '...' : name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10 sites

    const materialData = Object.entries(materialCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

    const handleMouseDown = (e) => {
        if (e.target.closest('.window-controls')) return;
        if (e.target.closest('button')) return;
        setIsDragging(true);
        const rect = windowRef.current.getBoundingClientRect();
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    };

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
        const handleMouseMove = (e) => {
            if (isDragging && windowRef.current) {
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
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'move';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
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
                    <button className="window-control-btn minimize" onClick={() => setIsMinimized(!isMinimized)} title="Minimize">
                        <i className="fas fa-minus"></i>
                    </button>
                    <button className="window-control-btn close" onClick={onClose} title="Close">
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            {!isMinimized && (
                <div className="window-content">
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
                            <div className="stat-value">{Object.keys(siteCounts).length}</div>
                            <div className="stat-label">Unique Sites</div>
                        </div>
                    </div>

                    <div className="charts-container">
                        {/* Material/Nature Distribution - Pie Chart */}
                        {materialData.length > 0 && (
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
                                        >
                                            {materialData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Material/Nature Distribution - Bar Chart */}
                        {materialData.length > 0 && (
                            <div className="chart-section">
                                <h3 className="chart-title">
                                    <i className="fas fa-chart-bar" style={{ marginRight: '8px' }}></i>
                                    Material Count (Bar Chart)
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={materialData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="value" fill="#3b82f6" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Sites Distribution - Bar Chart */}
                        {siteData.length > 0 && (
                            <div className="chart-section">
                                <h3 className="chart-title">
                                    <i className="fas fa-map-marker-alt" style={{ marginRight: '8px' }}></i>
                                    Top Sites Distribution
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={siteData} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis type="number" />
                                        <YAxis dataKey="name" type="category" width={120} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="count" fill="#10b981" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Material Table */}
                        {materialData.length > 0 && (
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

