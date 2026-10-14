<?php
/**
 * Fallback template: lists posts, or a message when there are none.
 *
 * @package Blixis\Theme
 */

get_header();

if ( have_posts() ) {
	while ( have_posts() ) {
		the_post();
		get_template_part( 'template-parts/content', (string) get_post_type() );
	}
	the_posts_pagination();
} else {
	get_template_part( 'template-parts/content', 'none' );
}

get_footer();
