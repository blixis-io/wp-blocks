<?php
/**
 * The page-not-found template.
 *
 * @package Blixis\Theme
 */

get_header();
?>
<section class="error-404 not-found">
	<header class="page-header">
		<h1 class="page-title"><?php esc_html_e( 'Page not found', 'blixis' ); ?></h1>
	</header>
	<p><?php esc_html_e( 'Nothing was found at this address. Try a search instead.', 'blixis' ); ?></p>
	<?php get_search_form(); ?>
</section>
<?php
get_footer();
