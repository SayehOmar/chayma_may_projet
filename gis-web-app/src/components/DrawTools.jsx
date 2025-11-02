import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet-draw/dist/leaflet.draw.css';

const DrawTools = ({ map, activeTool, setTool }) => {
    const drawnItems = useRef(new L.FeatureGroup());
    const [isDrawing, setIsDrawing] = useState(false);
    const currentPolyline = useRef(null);
    const longPressTimer = useRef(null);

    useEffect(() => {
        if (!map) return;

        map.addLayer(drawnItems.current);

        const handleMouseDown = (e) => {
            if (activeTool === 'draw') {
                setIsDrawing(true);
                currentPolyline.current = L.polyline([e.latlng], { color: 'red', weight: 10 }).addTo(drawnItems.current);
            }
        };

        const handleMouseMove = (e) => {
            if (isDrawing && activeTool === 'draw') {
                currentPolyline.current.addLatLng(e.latlng);
            }
        };

        const handleMouseUp = () => {
            setIsDrawing(false);
            currentPolyline.current = null;
        };

        if (activeTool === 'draw') {
            map.on('mousedown', handleMouseDown);
            map.on('mousemove', handleMouseMove);
            map.on('mouseup', handleMouseUp);
            map.dragging.disable();
        } else {
            map.off('mousedown', handleMouseDown);
            map.off('mousemove', handleMouseMove);
            map.off('mouseup', handleMouseUp);
            if(activeTool !== 'pan'){
                map.dragging.enable();
            }
        }

        return () => {
            map.off('mousedown', handleMouseDown);
            map.off('mousemove', handleMouseMove);
            map.off('mouseup', handleMouseUp);
        };
    }, [map, activeTool, isDrawing]);

    const handleEraseClick = () => {
        const layers = drawnItems.current.getLayers();
        if (layers.length > 0) {
            const lastLayer = layers[layers.length - 1];
            drawnItems.current.removeLayer(lastLayer);
        }
    };

    const handleEraseMouseDown = () => {
        longPressTimer.current = setTimeout(() => {
            drawnItems.current.clearLayers();
        }, 1000); // 1 second for long press
    };

    const handleEraseMouseUp = () => {
        clearTimeout(longPressTimer.current);
    };

    useEffect(() => {
        const eraseButton = document.getElementById('erase-button');
        if (eraseButton) {
            eraseButton.addEventListener('click', handleEraseClick);
            eraseButton.addEventListener('mousedown', handleEraseMouseDown);
            eraseButton.addEventListener('mouseup', handleEraseMouseUp);
            eraseButton.addEventListener('mouseleave', handleEraseMouseUp);
        }

        return () => {
            if (eraseButton) {
                eraseButton.removeEventListener('click', handleEraseClick);
                eraseButton.removeEventListener('mousedown', handleEraseMouseDown);
                eraseButton.removeEventListener('mouseup', handleEraseMouseUp);
                eraseButton.removeEventListener('mouseleave', handleEraseMouseUp);
            }
        };
    }, []);

    return null; // This component does not render anything itself
};

export default DrawTools;