<?php
/**
 * Deterministic development fixtures (BWB-012). Run with: wp eval-file /fixtures/seed.php (no strict_types: eval-file cannot honour it)
 * Idempotent: rerunning updates existing records instead of duplicating them.
 *
 * @package Blixis\Tooling
 */

// Refuse to run anywhere but the disposable development stack: this script resets passwords, overwrites pages
// and changes site options. docker/compose.yml defines both guards.
if ( ! defined( 'BLIXIS_DEV_FIXTURES' ) || true !== BLIXIS_DEV_FIXTURES || 'local' !== wp_get_environment_type() ) {
	WP_CLI::error( 'Refusing to seed: BLIXIS_DEV_FIXTURES is not defined or this is not a local environment.' );
}

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
	$blixis_result   = $blixis_existing
		? wp_update_user( array_merge( $blixis_args, array( 'ID' => $blixis_existing->ID ) ) )
		: wp_insert_user( $blixis_args );
	if ( is_wp_error( $blixis_result ) ) {
		WP_CLI::error( 'Could not create or update user ' . $blixis_login . ': ' . $blixis_result->get_error_message() );
	}
}

// Pages with stable slugs and content, identified by slug so reruns update in place.
$blixis_pages = array(
	'home'    => array(
		'title'   => 'Blixis Home',
		'content' => '<h2>Blixis fixture home</h2><p>Deterministic content for tests.</p>',
	),
	'about'   => array(
		'title'   => 'About fixture',
		'content' => '<h2>About</h2><p>Second sample page.</p>',
	),
	'contact' => array(
		'title'   => 'Contact fixture',
		'content' => '<h2>Contact</h2><p>Third sample page.</p>',
	),
	'blog' => array(
		'title'   => 'Blog',
		'content' => '',
	),
);
$blixis_ids   = array();
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
	$blixis_id = wp_insert_post( $blixis_post, true );
	if ( is_wp_error( $blixis_id ) ) {
		WP_CLI::error( 'Could not create or update page ' . $blixis_slug . ': ' . $blixis_id->get_error_message() );
	}
	$blixis_ids[ $blixis_slug ] = $blixis_id;
}

update_option( 'show_on_front', 'page' );
update_option( 'page_on_front', $blixis_ids['home'] );
update_option( 'page_for_posts', $blixis_ids['blog'] );
$blixis_category = get_category_by_slug( 'blixis-news' );
if ( ! $blixis_category ) {
	$blixis_category = wp_insert_term( 'Blixis news', 'category', array( 'slug' => 'blixis-news' ) );
}
if ( is_wp_error( $blixis_category ) ) {
	WP_CLI::error( 'Could not create sample category: ' . $blixis_category->get_error_message() );
}
$blixis_category_id = is_array( $blixis_category ) ? $blixis_category['term_id'] : $blixis_category->term_id;
$blixis_post = get_page_by_path( 'blixis-sample-post', OBJECT, 'post' );
$blixis_post_args = array(
	'post_type'     => 'post',
	'post_name'     => 'blixis-sample-post',
	'post_title'    => 'Blixis sample post',
	'post_content'  => '<h2>Sample details</h2><p>Blixis fixture post body.</p>',
	'post_status'   => 'publish',
	'post_author'   => 1,
	'post_category' => array( $blixis_category_id ),
);
if ( $blixis_post ) {
	$blixis_post_args['ID'] = $blixis_post->ID;
}
$blixis_post_id = wp_insert_post( $blixis_post_args, true );
if ( is_wp_error( $blixis_post_id ) ) {
	WP_CLI::error( 'Could not create sample post: ' . $blixis_post_id->get_error_message() );
}
update_option( 'blogname', 'Blixis Dev' );
update_option( 'timezone_string', 'UTC' );
update_option( 'permalink_structure', '/%postname%/' );
update_option( 'blog_public', '0' );
flush_rewrite_rules( true );

echo 'seeded: ' . count( $blixis_ids ) . ' pages, ' . count( $blixis_users ) . " users\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
