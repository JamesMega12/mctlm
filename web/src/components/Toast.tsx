import { useStore } from '../store/useStore';

export default function Toast() {
  const text = useStore((s) => s.toastText);
  return (
    <div className="toast" role="status" style={{ display: text ? 'block' : 'none' }}>
      {text}
    </div>
  );
}
