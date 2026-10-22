export default function ToggleSwitch({
  checked = false,
  onChange,
  id,
  disabled = false,
  size = 'md',
  className = '',
  title,
  ariaLabel,
  ...rest
}) {
  return (
    <label
      className={`toggle-switch ${size === 'sm' ? 'toggle-sm' : size === 'lg' ? 'toggle-lg' : ''} ${disabled ? 'disabled' : ''} ${className}`.trim()}
      title={title}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0, display: 'inline-block' }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        id={id}
        checked={Boolean(checked)}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel || title}
        {...rest}
      />
      <span className="toggle-slider" />
    </label>
  );
}
