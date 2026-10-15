<?php
/**
 * A single post.
 *
 * @package Blixis\Theme
 */

get_header();

while ( have_posts() ) {
	the_post();
	$blixis_shell = \Blixis\Theme\Setup::page_shell( get_post() );
	echo $blixis_shell['open']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Shared shell is generated from sanitized post metadata.
	get_template_part( 'template-parts/content', (string) get_post_type() );
	the_post_navigation();
	if ( comments_open() || get_comments_number() ) {
		comments_template();
	}
	echo $blixis_shell['close']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Shared shell closing tags are fixed markup.
}

get_footer();
