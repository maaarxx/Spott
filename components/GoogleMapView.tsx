"use client";

import MapView, { type MapViewProps } from "./MapView";

// Alias to maintain compatibility while transitioning away from Google Maps
export default function GoogleMapView(props: MapViewProps & { apiKey?: string }) {
  const { apiKey: _apiKey, ...rest } = props;
  return <MapView {...rest} />;
}
