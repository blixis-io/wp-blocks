<?php
/**
 * Real-WordPress storage checks for BWB-040. Run through `wp eval` (see wp-env.mjs); prints one JSON object.
 * Not part of the distributed plugin. The submitted revision value is only a placeholder (>= 1); the store sets it to expected + 1.
 */

use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\SnapshotStore;
use Blixis\Builder\Storage\StreamStore;
use Blixis\Builder\Storage\WpdbDatabase;

global $wpdb;
$db      = new WpdbDatabase( $wpdb );
$streams = new StreamStore( $db );
$layout  = static fn ( int $n, string $note = '' ): string => wp_json_encode(
	[
		'schemaVersion'  => 1,
		'layoutRevision' => $n,
		'note'           => $note,
	]
);
$content = static fn ( int $n ): string => wp_json_encode(
	[
		'schemaVersion'   => 1,
		'contentRevision' => $n,
	]
);
$out     = [];
$post_id = wp_insert_post(
	[
		'post_type'   => 'page',
		'post_title'  => 'Storage smoke',
		'post_status' => 'draft',
		'post_author' => 1,
	]
);

// CAS and independent streams.
$first                = $streams->write( $post_id, MetaKeys::LAYOUT, $layout( 1 ), 0 );
$stale                = $streams->write( $post_id, MetaKeys::LAYOUT, $layout( 1 ), 0 );
$second               = $streams->write( $post_id, MetaKeys::LAYOUT, $layout( 1, 'two' ), 1 );
$nl                   = $streams->write( $post_id, MetaKeys::content( 'nl_NL' ), $content( 1 ), 0 );
$out['first']         = $first->success;
$out['stale_blocked'] = ! $stale->success;
$out['second']        = $second->success;
$out['layout_rev']    = $streams->read( $post_id, MetaKeys::LAYOUT )['revision'] ?? -1;
$out['nl_independent'] = $nl->success && 1 === ( $streams->read( $post_id, MetaKeys::content( 'nl_NL' ) )['revision'] ?? -1 ) && 2 === $out['layout_rev'];
$out['single_row']    = 1 === count( $db->rows( $post_id, MetaKeys::LAYOUT ) );

// Core revisions and autosave never copy or restore builder streams.
wp_update_post(
	[
		'ID'         => $post_id,
		'post_title' => 'Storage smoke 2',
	]
);
$revisions = wp_get_post_revisions( $post_id );
if ( ! $revisions ) {
	wp_save_post_revision( $post_id );
	$revisions = wp_get_post_revisions( $post_id );
}
$out['revision_created']  = count( $revisions ) > 0;
$revision_meta            = [];
foreach ( $revisions as $revision ) {
	$revision_meta = array_merge( $revision_meta, array_keys( get_post_meta( $revision->ID ) ) );
}
$out['revision_has_builder_meta'] = (bool) array_filter( $revision_meta, static fn ( $key ) => str_starts_with( (string) $key, '_blixis_' ) );
$streams->write( $post_id, MetaKeys::LAYOUT, $layout( 1, 'three' ), 2 );
$before = $streams->read( $post_id, MetaKeys::LAYOUT )['value'] ?? '';
if ( $revisions ) {
	wp_restore_post_revision( array_key_first( $revisions ) );
}
$out['restore_keeps_layout'] = ( $streams->read( $post_id, MetaKeys::LAYOUT )['value'] ?? '' ) === $before;
wp_set_current_user( 1 );
$autosave = wp_create_post_autosave(
	[
		'post_ID'      => $post_id,
		'post_type'    => 'page',
		'post_title'   => 'Autosaved',
		'post_content' => 'x',
	]
);
$out['autosave_ran']            = ! is_wp_error( $autosave );
$out['autosave_keeps_layout']   = ( $streams->read( $post_id, MetaKeys::LAYOUT )['value'] ?? '' ) === $before;
$out['autosave_has_builder_meta'] = is_int( $autosave ) && (bool) array_filter( array_keys( get_post_meta( $autosave ) ), static fn ( $key ) => str_starts_with( (string) $key, '_blixis_' ) );

// Interrupted publication: snapshot exists, pointer does not reference it.
$snap = wp_json_encode(
	[
		'schemaVersion'  => 1,
		'layoutRevision' => 1,
	]
);
$db->insert( $post_id, MetaKeys::snap_layout( 1 ), $snap );
$snaps                    = new SnapshotStore( $db, $streams );
$pointer0                 = wp_json_encode(
	[
		'schemaVersion'  => 1,
		'pointerRevision' => 1,
	]
);
$out['orphan_listed']     = [ MetaKeys::snap_layout( 1 ) ] === $snaps->unreferenced( $post_id, $pointer0 );
$out['live_pointer_none'] = null === $streams->read( $post_id, MetaKeys::PUBLISHED );
$snaps->collect( $post_id, '' );
$out['orphan_collected']  = [] === $db->snapshot_keys( $post_id );
$pointer1                 = wp_json_encode(
	[
		'schemaVersion'          => 1,
		'pointerRevision'        => 1,
		'publishedLayoutRevision' => 1,
	]
);
$publish                  = $snaps->publish( $post_id, MetaKeys::snap_layout( 1 ), $snap, 0, $pointer1 );
$out['publish_ok']        = $publish->success;
$out['snapshot_immutable'] = false;
try {
	$snaps->publish( $post_id, MetaKeys::snap_layout( 1 ), $snap, 1, $pointer1 );
} catch ( Throwable $e ) {
	$out['snapshot_immutable'] = true;
}
$out['referenced_kept'] = [] === $snaps->collect( $post_id, (string) $streams->read( $post_id, MetaKeys::PUBLISHED )['value'] ) && 1 === count( $db->snapshot_keys( $post_id ) );

// Authorization by role for fixed, dynamic and foreign keys.
$can = static function ( string $login, string $cap, string $key ) use ( $post_id ): bool {
	$user = get_user_by( 'login', $login );
	return $user ? user_can( $user->ID, $cap, $post_id, $key ) : false;
};
$out['auth'] = [
	'admin_fixed'      => $can( 'admin', 'edit_post_meta', MetaKeys::LAYOUT ),
	'editor_dynamic'   => $can( 'editor_ed', 'edit_post_meta', MetaKeys::content( 'nl_NL' ) ),
	'author_other'     => $can( 'author_ann', 'edit_post_meta', MetaKeys::content( 'nl_NL' ) ),
	'subscriber'       => $can( 'subscriber_sub', 'edit_post_meta', MetaKeys::LAYOUT ),
	'contributor'      => $can( 'contributor_con', 'edit_post_meta', MetaKeys::content( 'fr_FR' ) ),
	'foreign_protected' => $can( 'admin', 'edit_post_meta', '_blixis_evil' ),
];
$out['hostile_rejected'] = false;
try {
	$streams->write( $post_id, '_blixis_content_NL;DROP', $content( 1 ), 0 );
} catch ( Throwable $e ) {
	$out['hostile_rejected'] = true;
}
$out['post_id'] = $post_id;
$out['mysql']   = $wpdb->db_version();
$out['php']     = PHP_VERSION;
$out['wp']      = get_bloginfo( 'version' );
wp_delete_post( $post_id, true );
echo wp_json_encode( $out );
