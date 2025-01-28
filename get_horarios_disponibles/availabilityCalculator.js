function availabilityCalculator(inputData) {
  const { tratamientos, citas_programadas, prog_medicos, prog_espacios } = inputData;
  const availableSlots = [];

  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const minutesToTime = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  };

  tratamientos.forEach(({ tratamiento: t, medicos }) => {
    medicos.forEach(medico => {
      // Filtrar espacios habilitados para este médico y tratamiento
      medico.espacios.forEach(espacio => {
        
        // Obtener programaciones del espacio y médico
        const progEspacio = prog_espacios.filter(p => 
          p.id_espacio === espacio.id_espacio
        );
        
        const progMedico = prog_medicos.filter(p => 
          p.id_medico === medico.id_medico
        );

        // Combinar todas las posibles coincidencias de horarios
        progEspacio.forEach(espacioProg => {
          progMedico.forEach(medicoProg => {
            
            // Verificar coincidencia de fechas
            if (
              espacioProg.fecha_inicio.getTime() !== medicoProg.fecha_inicio.getTime() ||
              espacioProg.fecha_fin.getTime() !== medicoProg.fecha_fin.getTime()
            ) return;

            // Calcular ventana de tiempo disponible (intersección médico-espacio)
            const espacioStart = timeToMinutes(espacioProg.hora_inicio);
            const espacioEnd = timeToMinutes(espacioProg.hora_fin);
            const medicoStart = timeToMinutes(medicoProg.hora_inicio);
            const medicoEnd = timeToMinutes(medicoProg.hora_fin);
            
            const windowStart = Math.max(espacioStart, medicoStart);
            const windowEnd = Math.min(espacioEnd, medicoEnd);
            if (windowStart >= windowEnd) return;

            // Obtener TODAS las citas en este espacio para la fecha y dentro de la ventana de tiempo
            const citasEnEspacio = citas_programadas
              .filter(c => 
                c.id_espacio === espacio.id_espacio &&
                c.fecha_cita.getTime() === espacioProg.fecha_inicio.getTime()
              )
              // Filtrar citas que se solapan con la ventana de tiempo actual
              .filter(c => {
                const cStart = timeToMinutes(c.hora_inicio);
                const cEnd   = timeToMinutes(c.hora_fin);
                return !(cEnd <= windowStart || cStart >= windowEnd);
              })
              .map(c => ({
                start: timeToMinutes(c.hora_inicio),
                end: timeToMinutes(c.hora_fin)
              }))
              // CORRECCIÓN: Ordenar por hora de inicio correctamente
              .sort((a, b) => a.start - b.start);

            // Calcular huecos disponibles
            let lastEnd = windowStart;
            const intervals = [];
            
            for (const cita of citasEnEspacio) {
              if (cita.start > lastEnd) {
                intervals.push({ start: lastEnd, end: cita.start });
              }
              lastEnd = Math.max(lastEnd, cita.end);
            }
            
            if (lastEnd < windowEnd) {
              intervals.push({ start: lastEnd, end: windowEnd });
            }

            // Generar slots válidos
            intervals.forEach(({ start, end }) => {
              const latestStart = end - t.duracion_tratamiento;
              if (latestStart >= start) {
                availableSlots.push({
                  fecha_inicio: espacioProg.fecha_inicio.toISOString().slice(0, 10),
                  fecha_fin: espacioProg.fecha_fin.toISOString().slice(0, 10),
                  hora_inicio_minima: minutesToTime(start),
                  hora_inicio_maxima: minutesToTime(latestStart),
                  id_medico: medico.id_medico,
                  nombre_medico: medico.nombre_medico,
                  id_espacio: espacio.id_espacio,
                  nombre_espacio: espacio.nombre_espacio,
                  id_tratamiento: t.id_tratamiento,
                  nombre_tratamiento: t.nombre_tratamiento,
                  duracion_tratamiento: t.duracion_tratamiento,
                });
              }
            });
          });
        });
      });
    });
  });

  return availableSlots;
}

module.exports = availabilityCalculator;

// const response = availabilityCalculator({
//   tratamientos: [{
//       "tratamiento": {
//           "id_tratamiento": 824,
//           "nombre_tratamiento": "Primera cita de valoración",
//           "duracion_tratamiento": 30
//       },
//       "medicos": [
//           {
//               "id_medico": 120,
//               "nombre_medico": "Wanda Medina",
//               "espacios": [
//                   {
//                       "id_espacio": 139,
//                       "nombre_espacio": "Consulta 1 - Dra. Medina"
//                   }
//               ]
//           },
//           {
//               "id_medico": 123,
//               "nombre_medico": "Vanessa Thielen",
//               "espacios": [
//                   {
//                       "id_espacio": 142,
//                       "nombre_espacio": "Consulta 4 - Dra. Thielen"
//                   }
//               ]
//           },
//           {
//               "id_medico": 122,
//               "nombre_medico": "Sergio Cordero",
//               "espacios": [
//                   {
//                       "id_espacio": 141,
//                       "nombre_espacio": "Consulta 3 - Dr. Cordero"
//                   }
//               ]
//           },
//           {
//               "id_medico": 121,
//               "nombre_medico": "Orlando Soto",
//               "espacios": [
//                   {
//                       "id_espacio": 140,
//                       "nombre_espacio": "Consulta 2 - Dr.Soto"
//                   }
//               ]
//           },
//           {
//               "id_medico": 125,
//               "nombre_medico": "Nancy Miranda",
//               "espacios": [
//                   {
//                       "id_espacio": 144,
//                       "nombre_espacio": "Consulta 6 - Dra. Miranda"
//                   }
//               ]
//           },
//           {
//               "id_medico": 124,
//               "nombre_medico": "José Antonio Revuelta",
//               "espacios": [
//                   {
//                       "id_espacio": 143,
//                       "nombre_espacio": "Consulta 5 - Dr. Revuelta"
//                   }
//               ]
//           }
//       ]
//   }  
//   ],
//   citas_programadas: [
//       {
//         id_cita: 36416,
//         id_paciente: 167066,
//         id_medico: 122,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 1762,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '13:00:00',
//         hora_fin: '23:00:00',
//         id_estado_cita: 1,
//         id_espacio: 141,
//         observaciones_medicas: null,
//         comentarios_cita: null,
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:45:59.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36417,
//         id_paciente: 189504,
//         id_medico: 123,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 1752,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '16:00:00',
//         hora_fin: '16:20:00',
//         id_estado_cita: 1,
//         id_espacio: 142,
//         observaciones_medicas: null,
//         comentarios_cita: 'PECHO BR',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:00.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36418,
//         id_paciente: 167066,
//         id_medico: 150,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 1762,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '11:00:00',
//         hora_fin: '15:30:00',
//         id_estado_cita: 1,
//         id_espacio: 141,
//         observaciones_medicas: null,
//         comentarios_cita: 'NO PASA CONSULTA. EV',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:01.000Z'),
//         fecha_modificacion: new Date('2025-01-23T05:46:04.000Z'),
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36419,
//         id_paciente: 171595,
//         id_medico: 121,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 986,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '17:00:00',
//         hora_fin: '17:15:00',
//         id_estado_cita: 1,
//         id_espacio: 140,
//         observaciones_medicas: null,
//         comentarios_cita: 'revi lunares kb',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:01.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36424,
//         id_paciente: 173535,
//         id_medico: 121,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 986,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '10:00:00',
//         hora_fin: '10:15:00',
//         id_estado_cita: 1,
//         id_espacio: 140,
//         observaciones_medicas: null,
//         comentarios_cita: 'revibotox. ev',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:05.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36425,
//         id_paciente: 235670,
//         id_medico: 121,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 1768,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '12:30:00',
//         hora_fin: '13:00:00',
//         id_estado_cita: 1,
//         id_espacio: 140,
//         observaciones_medicas: null,
//         comentarios_cita: 'Valorara Manchas faciales y eliminar tatuaje BREVO kb',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:06.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36426,
//         id_paciente: 175317,
//         id_medico: 123,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 1751,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '15:00:00',
//         hora_fin: '15:10:00',
//         id_estado_cita: 1,
//         id_espacio: 142,
//         observaciones_medicas: null,
//         comentarios_cita: 'se quiere operar de nuevo br o eso dice',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:06.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36427,
//         id_paciente: 235695,
//         id_medico: 121,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 1768,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '10:30:00',
//         hora_fin: '11:00:00',
//         id_estado_cita: 1,
//         id_espacio: 140,
//         observaciones_medicas: null,
//         comentarios_cita: 'valorar si puede mejorar su nariz con remodelación BREVO kb',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:07.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36428,
//         id_paciente: 169585,
//         id_medico: 121,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 884,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '11:00:00',
//         hora_fin: '12:30:00',
//         id_estado_cita: 1,
//         id_espacio: 140,
//         observaciones_medicas: null,
//         comentarios_cita: 'LASER COC2 FACIAL COCMPLETO ENVIAR WHASTSSA A LAS 10:00 PAR ANESTESIA . EV AVISADA SI NO CANCELA NI ANULA ESTA CITA SE LE DA POR REALIZADA EV',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:08.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36429,
//         id_paciente: 235567,
//         id_medico: 123,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 1752,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '16:30:00',
//         hora_fin: '16:50:00',
//         id_estado_cita: 1,
//         id_espacio: 142,
//         observaciones_medicas: null,
//         comentarios_cita: 'PECHO BR',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:08.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36430,
//         id_paciente: 183688,
//         id_medico: 121,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 2222,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '18:30:00',
//         hora_fin: '19:00:00',
//         id_estado_cita: 1,
//         id_espacio: 140,
//         observaciones_medicas: null,
//         comentarios_cita: 'polinucleótidos avisar de venir media hora antes para la anestesia dejo abonados 50€ KB',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:09.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36431,
//         id_paciente: 163930,
//         id_medico: 121,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 986,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '18:00:00',
//         hora_fin: '18:15:00',
//         id_estado_cita: 1,
//         id_espacio: 140,
//         observaciones_medicas: null,
//         comentarios_cita: 'revi botox kb',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:10.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36432,
//         id_paciente: 188296,
//         id_medico: 121,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 904,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '17:30:00',
//         hora_fin: '18:00:00',
//         id_estado_cita: 1,
//         id_espacio: 140,
//         observaciones_medicas: null,
//         comentarios_cita: 'rinomodelacion br ( dice que esta pagada )',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:10.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 36433,
//         id_paciente: 189699,
//         id_medico: 121,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 986,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '13:30:00',
//         hora_fin: '13:45:00',
//         id_estado_cita: 1,
//         id_espacio: 140,
//         observaciones_medicas: null,
//         comentarios_cita: 'revi labios br?',
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-23T05:46:11.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       },
//       {
//         id_cita: 150760,
//         id_paciente: 51,
//         id_medico: 121,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         id_tratamiento: 1768,
//         fecha_cita: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '13:00:00',
//         hora_fin: '13:30:00',
//         id_estado_cita: 1,
//         id_espacio: 140,
//         observaciones_medicas: null,
//         comentarios_cita: null,
//         es_pack_bono: null,
//         id_pack_bono: null,
//         old_id: null,
//         id_contacto: null,
//         fecha_creacion: new Date('2025-01-28T23:08:56.000Z'),
//         fecha_modificacion: null,
//         usuario_creacion: null,
//         id_usuario_creacion: null
//       }
//     ],
//     prog_medicos: [
//       {
//         id_prog_medico: 2860,
//         id_medico: 121,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '10:00:00',
//         hora_fin: '14:30:00'
//       },
//       {
//         id_prog_medico: 2861,
//         id_medico: 121,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '15:00:00',
//         hora_fin: '19:00:00'
//       },
//       {
//         id_prog_medico: 2984,
//         id_medico: 122,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '13:00:00',
//         hora_fin: '15:30:00'
//       },
//       {
//         id_prog_medico: 2985,
//         id_medico: 122,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '16:00:00',
//         hora_fin: '20:00:00'
//       },
//       {
//         id_prog_medico: 3107,
//         id_medico: 123,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '15:00:00',
//         hora_fin: '19:30:00'
//       },
//       {
//         id_prog_medico: 3228,
//         id_medico: 120,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '11:00:00',
//         hora_fin: '14:00:00'
//       },
//       {
//         id_prog_medico: 3229,
//         id_medico: 120,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '15:00:00',
//         hora_fin: '20:00:00'
//       }
//     ],
//     prog_espacios: [
//       {
//         id_prog_espacio: 8649,
//         id_espacio: 139,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '10:00:00',
//         hora_fin: '20:00:00'
//       },
//       {
//         id_prog_espacio: 8713,
//         id_espacio: 140,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '10:00:00',
//         hora_fin: '20:00:00'
//       },
//       {
//         id_prog_espacio: 8777,
//         id_espacio: 141,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '10:00:00',
//         hora_fin: '20:00:00'
//       },
//       {
//         id_prog_espacio: 8841,
//         id_espacio: 142,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '10:00:00',
//         hora_fin: '20:00:00'
//       },
//       {
//         id_prog_espacio: 8905,
//         id_espacio: 143,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '10:00:00',
//         hora_fin: '20:00:00'
//       },
//       {
//         id_prog_espacio: 8969,
//         id_espacio: 144,
//         id_super_clinica: 50,
//         id_clinica: 66,
//         fecha_inicio: new Date('2025-01-30T00:00:00.000Z'),
//         fecha_fin: new Date('2025-01-30T00:00:00.000Z'),
//         hora_inicio: '10:00:00',
//         hora_fin: '20:00:00'
//       }
//     ]
// })

// console.log('response', response)