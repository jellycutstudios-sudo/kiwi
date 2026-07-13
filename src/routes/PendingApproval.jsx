import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';

export default function PendingApproval() {
  const { signOut, restaurant, staffDoc } = useAuthStore();

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
  };

  return (
    <div className="login-page" style={{ justifyContent: 'center', alignItems: 'center', background: 'var(--color-bg-secondary)' }}>
      <div className="login-form-box" style={{ width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', padding: 'var(--space-8)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 'var(--space-3)' }}>⏳</div>
          <h2 className="text-title2" style={{ marginBottom: 'var(--space-2)' }}>
            Account Pending Approval
          </h2>
          <p className="text-secondary text-subhead">
            Your restaurant registration is complete, but access is restricted until offline payment is verified.
          </p>
        </div>

        <div className="card card-padded" style={{ background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', border: '1.5px solid var(--color-orange)' }}>
          <div style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-headline)', color: 'var(--color-orange)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠️</span> Status: Pending Offline Payment
          </div>
          <hr style={{ border: 'none', borderTop: '1px dashed var(--color-separator)' }} />
          <div style={{ fontSize: 'var(--text-subhead)', lineHeight: 1.6 }}>
            <p><strong>Restaurant:</strong> {restaurant?.name || 'N/A'}</p>
            <p><strong>Restaurant ID:</strong> <code style={{ background: 'var(--color-bg-secondary)', padding: '2px 6px', borderRadius: 'var(--radius-xs)', fontSize: '12px' }}>{restaurant?.id}</code></p>
            <p><strong>Owner:</strong> {staffDoc?.name} ({staffDoc?.email})</p>
          </div>
        </div>

        <div style={{ fontSize: 'var(--text-footnote)', color: 'var(--color-label-tertiary)', background: 'var(--color-bg-secondary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
          <h4 style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)', marginBottom: 6 }}>Next Steps:</h4>
          <ol style={{ paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>
              Please contact the system Super Admin via{' '}
              <a 
                href={`https://wa.me/919400018008?text=Hello%20Super%20Admin,%20I%20have%20completed%20the%20registration%20for%20my%20restaurant%20and%20would%20like%20to%20arrange%20the%20offline%20payment%20verification.%0A%0ARestaurant%20ID%3A%20${restaurant?.id}`} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ color: 'var(--color-success, #28c840)', fontWeight: 'var(--weight-bold, 700)', textDecoration: 'underline' }}
              >
                WhatsApp (+91 94000 18008)
              </a>{' '}
              to make your subscription payment offline.
            </li>
            <li>Provide your <strong>Restaurant ID</strong> ({restaurant?.id || 'N/A'}) to the admin.</li>
            <li>Once the payment is received, the Super Admin will approve your account, and you will gain immediate access to DineOS.</li>
          </ol>
        </div>

        <button
          className="btn btn-secondary btn-lg"
          onClick={handleSignOut}
          style={{ width: '100%' }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
