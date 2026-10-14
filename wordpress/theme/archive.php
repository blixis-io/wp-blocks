<?php
/**
 * Archives: categories, tags, authors and dates.
 *
 * @package Blixis\Theme
 */

get_header();

if ( have_posts() ) {
	?>
	<header class="page-header">
		<?php the_archive_title( '<h1 class="page-title">', '</h1>' ); ?>
		<?php the_archive_description( '<div class="archive-description">', '</div>' ); ?>
	</header>
	<?php
	while ( have_posts() ) {
		the_post();
		get_template_part( 'template-parts/content', (string) get_post_type() );
	}
	the_posts_pagination();
} else {
	get_template_part( 'template-parts/content', 'none' );
}

get_footer();
