<?php
/**
 * Deterministic development fixtures (BWB-012). Run with: wp eval-file /fixtures/seed.php (no strict_types: eval-file cannot honour it)
 * Idempotent: rerunning updates existing records instead of duplicating them.
 *
 * @package Blixis\Tooling
 */

// Users for permission tests (administrator, editor, author, contributor, subscriber). Dev-only credentials.
$blixis_users = array(
	'editor_ed'       => 'editor',
	'author_ann'      => 'author',
	'contributor_con' => 'contributor',
	'subscriber_sub'  => 'subscriber',
);
foreach ( $blixis_users as $blixis_login => $blixis_role ) {
	$blixis_existing = get_user_by( 'login', $blixis_login );
	$blixis_args     = array(
		'user_login' => $blixis_login,
		'user_email' => $blixis_login . '@example.test',
		'user_pass'  => 'password',
		'role'       => $blixis_role,
	);
	if ( $blixis_existing ) {
		$blixis_args['ID'] = $blixis_existing->ID;
		wp_update_user( $blixis_args );
	} else {
		wp_insert_user( $blixis_args );
	}
}

// Pages with stable slugs and content, identified by slug so reruns update in place.
$blixis_pages = array(
	'home'    => array(
		'title'   => 'Blixis Home',
		'content' => '<h1>Blixis fixture home</h1><p>Deterministic content for tests.</p>',
	),
	'about'   => array(
		'title'   => 'About fixture',
		'content' => '<h2>About</h2><p>Second sample page.</p>',
	),
	'contact' => array(
		'title'   => 'Contact fixture',
		'content' => '<h2>Contact</h2><p>Third sample page.</p>',
	),
);
$blixis_ids = array();
foreach ( $blixis_pages as $blixis_slug => $blixis_page ) {
	$blixis_found = get_page_by_path( $blixis_slug, OBJECT, 'page' );
	$blixis_post  = array(
		'post_type'    => 'page',
		'post_name'    => $blixis_slug,
		'post_title'   => $blixis_page['title'],
		'post_content' => $blixis_page['content'],
		'post_status'  => 'publish',
		'post_author'  => 1,
	);
	if ( $blixis_found ) {
		$blixis_post['ID'] = $blixis_found->ID;
	}
	$blixis_ids[ $blixis_slug ] = wp_insert_post( $blixis_post );
}

update_option( 'show_on_front', 'page' );
update_option( 'page_on_front', $blixis_ids['home'] );
update_option( 'blogname', 'Blixis Dev' );
update_option( 'timezone_string', 'UTC' );
update_option( 'permalink_structure', '/%postname%/' );
update_option( 'blog_public', '0' );
flush_rewrite_rules( true );

echo 'seeded: ' . count( $blixis_ids ) . " pages, " . count( $blixis_users ) . " users\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
