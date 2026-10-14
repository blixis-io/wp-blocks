<?php
/**
 * Search results.
 *
 * @package Blixis\Theme
 */

get_header();

if ( have_posts() ) {
	?>
	<header class="page-header">
		<h1 class="page-title">
			<?php
			printf(
				/* translators: %s: search query. */
				esc_html__( 'Search results for: %s', 'blixis' ),
				'<span>' . esc_html( get_search_query() ) . '</span>'
			);
			?>
		</h1>
	</header>
	<?php
	while ( have_posts() ) {
		the_post();
		get_template_part( 'template-parts/content', 'search' );
	}
	the_posts_pagination();
} else {
	get_template_part( 'template-parts/content', 'none' );
}

get_footer();
