import { describe, it, expect } from 'vitest';
import { generatePayrollCSV } from './payrollExport';

describe('payrollExport - generatePayrollCSV', () => {
  it('should generate headers correctly binding the currency code', () => {
    const csv = generatePayrollCSV([], 'USD');
    const headers = csv.split('\n')[0].split(',');
    
    expect(headers).toContain('Staff Name');
    expect(headers).toContain('Rate (USD)');
    expect(headers).toContain('Gross Pay (USD)');
    expect(headers).toContain('Net Pay (USD)');
  });

  it('should format hourly employee payroll rows correctly', () => {
    const mockPayroll = [
      {
        staffName: 'Alice Johnson',
        role: 'Chef',
        salaryType: 'hourly',
        salaryRate: 15,
        hoursWorked: 40,
        overtimeHours: 5,
        overtimeRate: 1.5,
        grossPay: 600,
        bonus: 50,
        deductions: 20,
        netPay: 630,
        notes: 'Great work'
      }
    ];

    const csv = generatePayrollCSV(mockPayroll, 'INR');
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2); // 1 header + 1 row

    const dataRow = lines[1].split(',');
    expect(dataRow[0]).toBe('Alice Johnson');
    expect(dataRow[1]).toBe('Chef');
    expect(dataRow[2]).toBe('hourly');
    expect(dataRow[3]).toBe('15');
    expect(dataRow[4]).toBe('40');
    expect(dataRow[5]).toBe('5');
    expect(dataRow[6]).toBe('1.5');
    expect(dataRow[7]).toBe('600');
    expect(dataRow[8]).toBe('50');
    expect(dataRow[9]).toBe('20');
    expect(dataRow[10]).toBe('630');
    expect(dataRow[11]).toBe('Great work');
  });

  it('should format monthly salary type rows with N/A for hours and overtime', () => {
    const mockPayroll = [
      {
        staffName: 'Bob Smith',
        role: 'Manager',
        salaryType: 'monthly',
        salaryRate: 3000,
        grossPay: 3000,
        netPay: 3000,
        notes: ''
      }
    ];

    const csv = generatePayrollCSV(mockPayroll, 'INR');
    const dataRow = csv.split('\n')[1].split(',');

    expect(dataRow[2]).toBe('monthly');
    expect(dataRow[3]).toBe('3000');
    expect(dataRow[4]).toBe('N/A'); // Hours worked is N/A for monthly
    expect(dataRow[5]).toBe('N/A'); // Overtime hours is N/A for monthly
    expect(dataRow[6]).toBe('N/A'); // Overtime rate is N/A for monthly
  });

  it('should escape double quotes, commas, and newlines in cells correctly', () => {
    const mockPayroll = [
      {
        staffName: 'Doe, Jane "Manager"',
        role: 'Sous Chef',
        notes: 'Line 1\nLine 2'
      }
    ];

    const csv = generatePayrollCSV(mockPayroll, 'INR');
    const lines = csv.split('\n');
    
    // Header is line 0. Since there is a newline in the notes, it will span lines 1 and 2
    expect(lines).toHaveLength(3); 
    
    // Check that the staffName is wrapped in quotes and quotes inside are doubled
    expect(lines[1]).toContain('"Doe, Jane ""Manager"""');
    // Check that the notes starting on line 1 and ending on line 2 is wrapped in quotes
    expect(lines[1]).toContain('"Line 1');
    expect(lines[2]).toBe('Line 2"');
  });
});
