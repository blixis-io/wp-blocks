<?php
/**
 * Publishes through the REST layer in-process and prints the audit event the plugin fires (BWB-048).
 * Run: wp eval-file audit-smoke.php <post_id>. Not part of the distributed plugin.
 */

$post_id = (int) ( $args[0] ?? 0 );
wp_set_current_user( 1 );
$events = [];
add_action(
	'blixis_builder_publication_event',
	static function ( $event ) use ( &$events ): void {
		$events[] = $event;
	}
);
$put = new WP_REST_Request( 'PUT', "/blixis/v1/documents/$post_id/layout" );
$put->set_header( 'content-type', 'application/json' );
$put->set_header( 'if-match', '"0"' );
$put->set_body( '{"schemaVersion":1,"documentId":"doc-aud","layoutRevision":1,"root":[{"id":"hed-1","type":"blixis/heading","props":{},"children":[]}]}' );
$saved = rest_do_request( $put );
$post  = new WP_REST_Request( 'POST', "/blixis/v1/documents/$post_id/publish" );
$post->set_header( 'content-type', 'application/json' );
$post->set_header( 'if-match', '"0"' );
$post->set_body( '{"layout":true}' );
$result = rest_do_request( $post );
echo wp_json_encode(
	[
		'saved'  => $saved->get_status(),
		'status' => $result->get_status(),
		'events' => $events,
	]
);
