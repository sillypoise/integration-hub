CREATE FUNCTION p1_reject_source_event_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'p1_source_events are immutable' USING ERRCODE = 'check_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER p1_source_events_p1_immutable_trigger
BEFORE UPDATE ON p1_source_events
FOR EACH ROW
EXECUTE FUNCTION p1_reject_source_event_update();
