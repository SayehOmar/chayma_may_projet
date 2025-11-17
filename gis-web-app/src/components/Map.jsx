import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const MapInner = ({ setMap }) => {
    const map = useMap();
    useEffect(() => {
        setMap(map);
    }, [map, setMap]);
    return null;
}

const Map = ({ setMap }) => {
    return (
        <MapContainer 
            center={[36.8065, 10.1815]} 
            zoom={13} 
            style={{ height: '100%', width: '100%' }}
            dragging={true}
            doubleClickZoom={true}
            scrollWheelZoom={true}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapInner setMap={setMap} />
        </MapContainer>
    );
};

export default Map;