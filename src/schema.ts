export type Field = {
  cell: string; label: string; type?: 'date' | 'number' | 'email' | 'textarea';
  options?: string[]; required?: boolean; wide?: boolean; placeholder?: string;
  min?: number; max?: number;
};
export type Section = { id: string; title: string; subtitle: string; group: string; fields: Field[] };
const civil = ['Soltero', 'Casado', 'Divorciado', 'Viudo', 'Separado', 'Concubinado'];
const housing = ['Propia', 'Familiar', 'Alquilada', 'Anticrético', 'Otra'];
const yesno = ['Si', 'No'];
const f = (cell: string, label: string, extra: Partial<Field> = {}): Field => ({ cell, label, ...extra });
const address = (street: string, num: string, zone: string, prefix = ''): Field[] => [
  f(street, `${prefix}Calle o avenida`, { wide: true }), f(num, `${prefix}Número`), f(zone, `${prefix}Zona o barrio`),
];
function person(prefix: string, start: number, guarantor = false): Field[] {
  return [
    f(`${prefix}${start}`, 'Nombres y apellidos', { required: !guarantor, wide: true, placeholder: 'Ej. María Elena Pérez López' }),
    f(`${prefix}${start + 1}`, 'Cédula de identidad + extensión', { required: !guarantor, placeholder: 'Ej. 1234567 LP' }),
    f(`${prefix}${start + 2}`, 'Fecha de nacimiento', { type: 'date' }),
    f(`${prefix}${start + 3}`, 'Estado civil', { options: civil }),
    f(`${prefix}${start + 4}`, 'Tiempo en este estado civil', { placeholder: 'Ej. 3 años' }),
  ];
}
function guarantor(n: number, row: number): Section {
  return { id: `garante${n}`, title: `Garante ${n}`, subtitle: 'Identificación, domicilio y actividad de la persona garante.', group: 'Participantes', fields: [
    ...person('AH', row, true), ...address(`AJ${row + 5}`, `AQ${row + 5}`, `AS${row + 5}`),
    f(`AH${row + 6}`, 'Teléfono / celular'), f(`AH${row + 7}`, 'Tipo de domicilio', { options: housing }),
    f(`AH${row + 8}`, 'Relación con el solicitante'), f(`AH${row + 10}`, 'Actividad económica', { wide: true }),
    f(`AH${row + 11}`, 'El lugar de trabajo es', { options: ['Propio', 'Alquilado', 'Familiar', 'Otro'] }),
    f(`AO${row + 11}`, 'Otro lugar de trabajo'), f(`AH${row + 12}`, 'Realiza su actividad en', { options: ['Calle', 'Local', 'Domicilio', 'Otro'] }),
    f(`AO${row + 12}`, 'Otro espacio'), ...address(`AJ${row + 13}`, `AQ${row + 13}`, `AS${row + 13}`, 'Negocio: '),
  ] };
}
export const sections: Section[] = [
  { id: 'solicitante', title: 'Datos del solicitante', subtitle: 'Empecemos con la persona que solicita el crédito.', group: 'Información general', fields: [
    ...person('J', 2), f('J7', 'Teléfono fijo'), f('J8', 'Celular', { placeholder: 'Ej. 70000000' }), f('J9', 'NIT'),
    f('J10', 'Tipo de cliente', { options: ['Cliente antiguo', 'Cliente nuevo'] }),
    ...address('L11', 'S11', 'U11'), f('J12', 'Tipo de domicilio', { options: housing }),
  ] },
  { id: 'actividad', title: 'Actividad económica', subtitle: 'Información laboral y dirección de la actividad del solicitante.', group: 'Información general', fields: [
    f('J15', '¿Es independiente?', { options: yesno }), f('V15', '¿Es dependiente?', { options: yesno }),
    f('F16', 'Actividad independiente', { wide: true }), f('F17', 'Antigüedad de la actividad'), f('F18', 'Horario y días de atención'),
    f('F19', 'Teléfono de la actividad'), f('F20', 'El lugar es', { options: ['Propio', 'Alquilado', 'Familiar', 'Otro'] }),
    f('F21', 'Descripción de otro lugar'), f('Q16', 'Nombre de la empresa'), f('Q17', 'Actividad de la empresa'),
    f('Q18', 'Cargo actual'), f('Q19', 'Antigüedad laboral'), f('Q20', 'Horario y días de trabajo'),
    f('Q21', 'Tipo de contrato'), f('Q22', 'Teléfono de oficina'), ...address('L23', 'S23', 'U23', 'Actividad: '),
    f('J24', 'Otra actividad', { wide: true }),
  ] },
  { id: 'credito', title: 'Datos del crédito', subtitle: 'Monto, plazo y condiciones de la solicitud.', group: 'Información general', fields: [
    f('J26', 'Tipo de crédito', { options: ['Crédito directo', 'Línea de crédito', 'Refinanciamiento', 'Crédito bajo línea', 'Expromisión', 'Reprogramación'] }),
    f('J27', 'Monto solicitado (Bs)', { type: 'number', required: true, min: 0.01 }), f('J28', 'Monto solicitado (USD)', { type: 'number', min: 0 }),
    f('J29', 'Día de pago', { type: 'number', min: 1, max: 31 }), f('J30', 'Frecuencia de pago', { options: ['Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual'] }),
    f('J31', 'Propuesta de cuota (Bs)', { type: 'number', min: 0 }), f('J32', 'Plazo', { placeholder: 'Ej. 48 MESES', required: true }),
    f('J33', 'Destino del crédito', { type: 'textarea', wide: true }),
    f('J34', 'Aplicación de pagos adelantados', { options: ['Reducir el plazo del crédito', 'Reducir la cuota del crédito'] }),
    f('J36', '¿Tiene caja de ahorro?', { options: yesno }), f('J37', '¿Desea débito automático?', { options: yesno }),
    f('J38', 'Número de cuenta'), f('J39', 'Tipo de cuenta', { options: ['CAJA DE AHORRO', 'CUENTA CORRIENTE'] }),
  ] },
  { id: 'codeudor', title: 'Codeudor', subtitle: 'Completa esta sección cuando exista un codeudor.', group: 'Participantes', fields: [
    ...person('AH', 2, true), f('AH7', 'Teléfono fijo'), f('AH8', 'Celular'), f('AH9', 'NIT'),
    f('AH10', 'Tipo de cliente', { options: ['Cliente antiguo', 'Cliente nuevo'] }),
    ...address('AJ11', 'AQ11', 'AS11'), f('AH12', 'Tipo de domicilio', { options: housing }),
    f('AD15', 'Actividad independiente'), f('AD16', 'Antigüedad de la actividad'), f('AD17', 'Horario y días de atención'),
    f('AD18', 'Teléfono de la actividad'), f('AD19', 'El lugar es'), f('AD20', 'Otro lugar'),
    f('AO15', 'Nombre de la empresa'), f('AO16', 'Actividad de la empresa'), f('AO17', 'Cargo actual'),
    f('AO18', 'Antigüedad laboral'), f('AO19', 'Horario laboral'), f('AO20', 'Tipo de contrato'), f('AO21', 'Teléfono de oficina'),
    ...address('AJ22', 'AQ22', 'AS22', 'Actividad: '), f('AH23', 'Otra actividad'),
  ] },
  guarantor(1, 29), guarantor(2, 45),
  { id: 'vinculaciones', title: 'Relaciones y vinculaciones', subtitle: 'Declaraciones de parentesco, relaciones y garantías.', group: 'Declaraciones', fields: [
    f('J41', '¿Parentesco con trabajadores de FIE?', { options: yesno }), f('J42', 'Nombre del trabajador'), f('J43', 'Parentesco con el trabajador'),
    f('J44', '¿Relación con algún prestatario?', { options: yesno }), f('J45', 'Nombre del prestatario'), f('J46', 'Parentesco con el prestatario'), f('J47', 'Operación relacionada'),
    f('J48', '¿Vinculación con persona natural o jurídica?', { options: yesno }), f('J49', 'Relaciones por propiedad'),
    f('J50', 'Relaciones por administración'), f('J51', 'Soy garante personal o hipotecario de'),
    f('J54', 'Relaciones por actividad'), f('J55', 'Relaciones por destino'), f('J56', 'Actualmente me garantizan'),
  ] },
  { id: 'referencias', title: 'Referencias y seguros', subtitle: 'Contactos de referencia, beneficiarios y comentarios.', group: 'Declaraciones', fields: [
    f('J62', 'Nombre de la primera referencia', { wide: true }), f('J63', 'Relación de la primera referencia'),
    f('J64', 'Dirección de la primera referencia'), f('J65', 'Teléfono de la primera referencia'),
    f('J66', 'Nombre de la segunda referencia', { wide: true }), f('J67', 'Relación de la segunda referencia'),
    f('J68', 'Dirección de la segunda referencia'), f('J69', 'Teléfono de la segunda referencia'),
    f('J60', '¿Pagar seguro de desgravamen en las cuotas?', { options: yesno }), f('J71', 'Beneficiario primario del seguro'),
    f('J72', 'Beneficiario contingente'), f('J73', 'Correo electrónico', { type: 'email' }), f('J74', 'Comentarios', { type: 'textarea', wide: true }),
  ] },
  { id: 'tramite', title: 'Datos del trámite', subtitle: 'Responsable, agencia y fechas del expediente.', group: 'Declaraciones', fields: [
    f('J76', 'Oficial de negocios'), f('J77', 'Agencia'), f('J78', 'Fecha de solicitud', { type: 'date', required: true }),
    f('J79', 'Fecha de evaluación', { type: 'date' }), f('J80', 'Número de crédito', { required: true }), f('J81', 'Código COBIS del cliente'),
  ] },
];
export const allFields = sections.flatMap(s => s.fields);
export type FormData = Record<string, string>;
export const emptyForm = (): FormData => Object.fromEntries(allFields.map(f => [f.cell, '']));
export function fieldError(field: Field, value: string): string {
  if (field.required && !value.trim()) return 'Completa este dato para generar el documento.';
  if (!value) return '';
  if (field.type === 'number' && (!Number.isFinite(Number(value)) || (field.min !== undefined && Number(value) < field.min) || (field.max !== undefined && Number(value) > field.max))) return `Ingresa un número válido${field.min !== undefined ? ` desde ${field.min}` : ''}${field.max !== undefined ? ` hasta ${field.max}` : ''}.`;
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Revisa el correo electrónico.';
  if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Ingresa una fecha válida.';
  return '';
}
