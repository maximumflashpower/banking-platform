export default function Banner({ message }) {
  if (!message) return null;
  return <div className="wc-banner">{message}</div>;
}