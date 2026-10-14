<?php
/**
 * Search results.
 *
 * @package Blixis\Theme
 */

get_header();
?>
<header class="page-header">
	<h1 class="page-title">
		<?php
		printf(
			/* translators: %s: search query. */
			esc_html__( 'Search results for: %s', 'blixis' ),
			esc_html( get_search_query( false ) )
		);
		?>
	</h1>
</header>
<?php
if ( have_posts() ) {
	while ( have_posts() ) {
		the_post();
		get_template_part( 'template-parts/content', 'search' );
	}
	the_posts_pagination();
} else {
	echo '<p>' . esc_html__( 'Nothing matched your search. Try different words.', 'blixis' ) . '</p>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped translation in fixed markup.
	get_search_form();
}

get_footer();
