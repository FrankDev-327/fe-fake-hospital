/** A small piece of the ICD-10 catalog (the backend has the full table). */
export interface Icd10Code {
  code: string;
  title: string;
  chapter: string;
}

const c = (code: string, title: string, chapter: string): Icd10Code => ({
  code,
  title,
  chapter,
});

export const ICD10: Icd10Code[] = [
  c('A09', 'Infectious gastroenteritis and colitis, unspecified', 'I'),
  c('E11', 'Type 2 diabetes mellitus', 'IV'),
  c('E11.9', 'Type 2 diabetes mellitus without complications', 'IV'),
  c('E78.0', 'Pure hypercholesterolaemia', 'IV'),
  c('E86', 'Volume depletion (dehydration)', 'IV'),
  c('F32.9', 'Depressive episode, unspecified', 'V'),
  c('G43.9', 'Migraine, unspecified', 'VI'),
  c('I10', 'Essential (primary) hypertension', 'IX'),
  c('I20.0', 'Unstable angina', 'IX'),
  c('I21.9', 'Acute myocardial infarction, unspecified', 'IX'),
  c('I48.9', 'Atrial fibrillation and flutter, unspecified', 'IX'),
  c('I50.0', 'Congestive heart failure', 'IX'),
  c('I50.9', 'Heart failure, unspecified', 'IX'),
  c('I63.9', 'Cerebral infarction, unspecified', 'IX'),
  c('J06.9', 'Acute upper respiratory infection, unspecified', 'X'),
  c('J18.9', 'Pneumonia, unspecified organism', 'X'),
  c('J44.1', 'COPD with acute exacerbation', 'X'),
  c('J45.9', 'Asthma, unspecified', 'X'),
  c('K21.9', 'Gastro-oesophageal reflux disease without oesophagitis', 'XI'),
  c('K35.8', 'Acute appendicitis, other and unspecified', 'XI'),
  c('K80.2', 'Calculus of gallbladder without cholecystitis', 'XI'),
  c('M54.5', 'Low back pain', 'XIII'),
  c('M17.1', 'Primary gonarthrosis (knee arthrosis), unilateral', 'XIII'),
  c('N18.3', 'Chronic kidney disease, stage 3', 'XIV'),
  c('N39.0', 'Urinary tract infection, site not specified', 'XIV'),
  c('R50.9', 'Fever, unspecified', 'XVIII'),
  c('R07.4', 'Chest pain, unspecified', 'XVIII'),
  c('S72.0', 'Fracture of neck of femur', 'XIX'),
  c('S52.5', 'Fracture of lower end of radius', 'XIX'),
  c('Z00.0', 'General medical examination', 'XXI'),
];
