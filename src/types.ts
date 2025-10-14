export type SearchRow = {
  shipment_id: string;
  mode: "SEA" | "AIR";
  tracking_id: string | null;
  mbl_number: string | null;
  hbl_number: string | null;
  containers: string | null; // CSV các container (đã lower)
};

export type Shipment = {
  shipment_id: string;
  mode: "SEA" | "AIR";
  tracking_id: string | null;
  mbl_number: string | null;
  hbl_number: string | null;
  scope_of_service?: string | null;
  carrier: string | null;
  etd_date: string | null;
  atd_date: string | null;
  eta_date: string | null;
  ata_date: string | null;
  place_of_receipt: string | null;
  pol_aol: string | null;
  transshipment_ports: string | null;
  pod_aod: string | null;
  place_of_delivery: string | null;
  route: string | null;
  remarks: string | null;
};

export type InputSea = {
  shipment_id: string;
  container_number: string;
  vessel: string | null;
  voyage: string | null;
  size_type: string | null;
  weight_kg: number | null;
  volume_cbm: number | null;
  seal_no: string | null;
  temperature: string | null;
  vent: string | null;
};

export type InputAir = {
  shipment_id: string;
  flight: string;
  unit_kind: string | null;
  pieces: number | null;
  volume_cbm: number | null;
  weight_kg: number | null;
  chargeable_weight_kg: number | null;
};

export type MilestoneAny = Record<string, string | null>;
export type Note = {
  id: string;
  shipment_id: string;
  mode: "SEA" | "AIR";
  step: string | null;
  note: string | null;
  note_type: string | null;
  note_time: string | null;
  active: boolean | null;
};
