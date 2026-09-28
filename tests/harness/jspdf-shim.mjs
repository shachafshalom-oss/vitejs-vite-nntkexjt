// מחליף את 'jspdf' בבדיקות (ראו pdf-mock.cjs)
import m from './pdf-mock.cjs';
export default m.jsPDF;
export const jsPDF = m.jsPDF;
