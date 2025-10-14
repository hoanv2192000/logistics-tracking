import ShipmentClient from "./Client";

export default function ShipmentPage({
  params,
}: {
  params: { id: string };
}) {
  return <ShipmentClient id={params.id} />;
}
