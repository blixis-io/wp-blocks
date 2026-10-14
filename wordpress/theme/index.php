<?php
/**
 * Fallback template: lists posts, or a message when there are none.
 *
 * @package Blixis\Theme
 */

get_header();

if ( have_posts() ) {
	if ( is_home() ) {
		?>
		<header class="page-header">
			<h1 class="page-title"><?php echo is_front_page() ? esc_html__( 'Latest posts', 'blixis' ) : esc_html( (string) single_post_title( '', false ) ); ?></h1>
		</header>
		<?php
	}
	while ( have_posts() ) {
		the_post();
		get_template_part( 'template-parts/content', (string) get_post_type() );
	}
	the_posts_pagination();
} else {
	get_template_part( 'template-parts/content', 'none' );
}

get_footer();
