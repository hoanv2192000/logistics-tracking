import ShipmentClient from "./Client";

export default async function ShipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ShipmentClient id={id} />;
}


