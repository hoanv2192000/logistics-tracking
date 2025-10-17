import ShipmentClient from "./Client";

export default function ShipmentPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params; // không cần await
  return <ShipmentClient id={id} />;
}
