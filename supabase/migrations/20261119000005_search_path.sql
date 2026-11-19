-- Fige le search_path des fonctions restantes (alerte Supabase « function_search_path_mutable »).
alter function public.lock_pairings() set search_path = '';
alter function public.lock_bye_points() set search_path = '';
alter function public.forbid_change() set search_path = '';
alter function public.result_label(text) set search_path = '';
