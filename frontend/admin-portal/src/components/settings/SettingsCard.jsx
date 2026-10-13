import Card from "../ui/Card";

// One card on a settings page: a titled header over its controls. Shared by
// staff My Settings and the guardian portal's My settings.
export default function SettingsCard({ title, titleId, description, children }) {
  return (
    <Card padding="none">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 id={titleId} className="text-sm font-bold text-neutral-900">{title}</h2>
        <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
      </div>
      {children}
    </Card>
  );
}
