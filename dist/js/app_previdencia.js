/**
 * app_previdencia.js — Reusa a classe AppFundos com kind='previdencia'.
 * O DOM da página é idêntico ao de fundos.html (gerado por sed); só muda o
 * dataset que o pool consulta e os labels VGBL/PGBL na tabela.
 */
import { AppFundos } from './app_fundos.js';

new AppFundos({ kind: 'previdencia' }).boot();
