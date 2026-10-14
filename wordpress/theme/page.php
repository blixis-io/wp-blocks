<?php
/**
 * A page. The page body is `the_content()`, which the Blixis Builder replaces with its own rendering when a page was built with it.
 *
 * @package Blixis\Theme
 */

get_header();

while ( have_posts() ) {
	the_post();
	get_template_part( 'template-parts/content', 'page' );
	if ( comments_open() || get_comments_number() ) {
		comments_template();
	}
}

get_footer();
