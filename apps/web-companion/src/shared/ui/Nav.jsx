export default function Nav({ currentPath }) {
  const items = [
    { href: "/chat", label: "Chat", area: "social" },
    { href: "/personal", label: "Personal", area: "identity" },
    { href: "/business", label: "Business", area: "identity" },
    { href: "/financial-inbox", label: "Financial Inbox", area: "ops" },
    { href: "/approvals", label: "Approvals", area: "finance" },
  ];

  return (
    <aside className="wc-nav">
      <div className="wc-nav-title">Web Companion</div>

      <div className="wc-nav-group-label">Social</div>
      {items.filter(i => i.area === "social").map(renderItem)}

      <div className="wc-nav-group-label">Identity / Spaces</div>
      {items.filter(i => i.area === "identity").map(renderItem)}

      <div className="wc-nav-group-label">Financial Operations</div>
      {items.filter(i => i.area === "ops" || i.area === "finance").map(renderItem)}
    </aside>
  );

  function renderItem(item) {
    const active = currentPath === item.href;
    return (
      <a
        key={item.href}
        href={item.href}
        className={`wc-nav-item ${active ? "is-active" : ""}`}
      >
        {item.label}
      </a>
    );
  }
}