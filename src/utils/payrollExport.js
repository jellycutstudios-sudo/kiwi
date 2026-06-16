/**
 * Utility to export payroll data to CSV format and trigger download
 * @param {Array} payrollData - Array of payroll records
 * @param {string} month - The month string (e.g. "2026-06")
 * @param {string} currency - Currency code (e.g. "INR", "USD")
 */
export function exportPayrollToCSV(payrollData, month, currency = 'INR') {
  const headers = [
    'Staff Name',
    'Role',
    'Salary Type',
    `Rate (${currency})`,
    'Hours Worked',
    'Overtime Hours',
    'Overtime Rate',
    `Gross Pay (${currency})`,
    `Bonus (${currency})`,
    `Deductions (${currency})`,
    `Net Pay (${currency})`,
    'Notes'
  ];

  const rows = payrollData.map(p => [
    p.staffName || '',
    p.role || '',
    p.salaryType || 'hourly',
    p.salaryRate || 0,
    p.salaryType === 'hourly' ? (p.hoursWorked || 0) : 'N/A',
    p.salaryType === 'hourly' ? (p.overtimeHours || 0) : 'N/A',
    p.salaryType === 'hourly' ? (p.overtimeRate || 1.5) : 'N/A',
    p.grossPay || 0,
    p.bonus || 0,
    p.deductions || 0,
    p.netPay || 0,
    (p.notes || '').replace(/"/g, '""') // Escape double quotes
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(val => {
      // Escape commas and wrap in quotes if necessary
      const strVal = String(val);
      if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
        return `"${strVal.replace(/"/g, '""')}"`;
      }
      return strVal;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `payroll_${month}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
