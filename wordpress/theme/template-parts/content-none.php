<?php
/**
 * Shown when there is nothing to list.
 *
 * @package Blixis\Theme
 */

?>
<section class="no-results not-found">
	<header class="page-header">
		<h1 class="page-title"><?php esc_html_e( 'Nothing found', 'blixis' ); ?></h1>
	</header>
	<?php if ( is_search() ) : ?>
		<p><?php esc_html_e( 'Nothing matched your search. Try different words.', 'blixis' ); ?></p>
	<?php else : ?>
		<p><?php esc_html_e( 'There is nothing to show here yet.', 'blixis' ); ?></p>
	<?php endif; ?>
	<?php get_search_form(); ?>
</section>
