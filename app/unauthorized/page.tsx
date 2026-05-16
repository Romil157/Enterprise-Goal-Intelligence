export default function UnauthorizedPage() {
  return (
    <main style={{ maxWidth: 680, margin: "12vh auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>Access denied</h1>
      <p>Your authenticated role does not grant access to this area.</p>
    </main>
  );
}
