<?php
/**
 * Archives: categories, tags, authors and dates.
 *
 * @package Blixis\Theme
 */

get_header();
?>
<header class="page-header">
	<?php the_archive_title( '<h1 class="page-title">', '</h1>' ); ?>
	<?php the_archive_description( '<div class="archive-description">', '</div>' ); ?>
</header>
<?php
if ( have_posts() ) {
	while ( have_posts() ) {
		the_post();
		get_template_part( 'template-parts/content', (string) get_post_type() );
	}
	the_posts_pagination();
} else {
	echo '<p>' . esc_html__( 'There is nothing to show here yet.', 'blixis' ) . '</p>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped translation in fixed markup.
}

get_footer();
