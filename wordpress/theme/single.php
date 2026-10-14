<?php
/**
 * A single post.
 *
 * @package Blixis\Theme
 */

get_header();

while ( have_posts() ) {
	the_post();
	get_template_part( 'template-parts/content', (string) get_post_type() );
	the_post_navigation();
	if ( comments_open() || get_comments_number() ) {
		comments_template();
	}
}

get_footer();
