-- Migration: 29_drop_legacy_register_player_overload
-- Purpose: Remove insecure register_player overload without password argument

DROP FUNCTION IF EXISTS public.register_player(text, text, text);