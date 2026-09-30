/** Lat/lng for route math (no Google types). */
export interface Point {
  lat: number;
  lng: number;
}

/** Serializable place for API and pure logic (no Google types). */
export interface PlaceForLink {
  name: string;
  vicinity: string;
}

/** Input for building a Google Maps directions URL. */
export interface GoogleMapsLinkInput {
  origin: string;
  destination: string;
  places: PlaceForLink[];
}
