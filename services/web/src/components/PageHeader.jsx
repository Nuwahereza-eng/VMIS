// Consistent page heading: an icon tile, a title, and a supporting line.
export default function PageHeader({ icon, title, subtitle, actions }) {
  return (
    <div className="page-head">
      <div className="page-head__icon">
        <i className={"bi " + icon} />
      </div>
      <div className="flex-grow-1">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="d-flex align-items-center gap-2">{actions}</div>}
    </div>
  );
}
