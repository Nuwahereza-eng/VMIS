// Consistent page heading: an icon tile, a title, and a supporting line.
export default function PageHeader({ icon, title, subtitle, actions }) {
  return (
    <div className="page-head">
      <div className="page-head__icon">
        <i className={"bi " + icon} />
      </div>
      <div className="page-head__text">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </div>
  );
}
