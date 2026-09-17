'use client';

const SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    shortLabel: 'Home'
  },
  {
    id: 'weekly',
    label: 'Weekly Operations',
    shortLabel: 'Weekly'
  },
  {
    id: 'league',
    label: 'League Management',
    shortLabel: 'League'
  },
  {
    id: 'data',
    label: 'Data & Projections',
    shortLabel: 'Data'
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    shortLabel: 'Checks'
  }
];

export function CommissionerNavigation({
  activeSection,
  onSectionChange
}) {
  return (
    <nav
      className="commissionerNavigation"
      aria-label="Commissioner Center sections"
    >
      <div className="commissionerNavigationScroll">
        {SECTIONS.map(section => {
          const active =
            section.id === activeSection;

          return (
            <button
              className={`commissionerNavigationButton${
                active ? ' active' : ''
              }`}
              type="button"
              key={section.id}
              aria-current={
                active ? 'page' : undefined
              }
              onClick={() =>
                onSectionChange(section.id)
              }
            >
              <span className="commissionerNavigationFull">
                {section.label}
              </span>

              <span className="commissionerNavigationShort">
                {section.shortLabel}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
