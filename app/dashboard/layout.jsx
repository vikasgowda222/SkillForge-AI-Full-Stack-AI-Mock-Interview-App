import React from "react";

// The root layout already renders the Header, Footer, and the <main> landmark,
// so this dashboard layout is just a passthrough for now.
function DashboardLayout({ children }) {
  return <>{children}</>;
}

export default DashboardLayout;
